using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Windows.Automation;

namespace SafeVault.Bridge.Automation;

public sealed record DesktopFillRequest(
    string ExpectedExecutablePath,
    string? WindowTitlePattern,
    string Username,
    string Password,
    FieldSelector? UsernameSelector = null,
    FieldSelector? PasswordSelector = null);

public sealed record DesktopPasteRequest(
    string ExpectedExecutablePath,
    string? WindowTitlePattern,
    bool PressTabAfter = false);

public sealed class CredentialFiller(ForegroundWindowInspector inspector)
{
    public AutomationResult InspectFields()
    {
        var (identity, code) = inspector.Inspect();
        if (identity is null) return new(false, code);
        var (_, fields, fieldCode) = ReadFields(identity.WindowHandle);
        return fieldCode == "ok"
            ? new(true, "ok", AppIdentity: identity, Fields: fields)
            : new(false, fieldCode, AppIdentity: identity);
    }

    public AutomationResult Fill(DesktopFillRequest request)
    {
        var (identity, identityCode) = inspector.Inspect();
        if (identity is null) return new(false, identityCode);
        if (!PathsEqual(identity.ExecutablePath, request.ExpectedExecutablePath)) return new(false, "foreground-changed");
        if (!MatchesTitle(request.WindowTitlePattern, identity.WindowTitle)) return new(false, "window-title-mismatch");

        var (elements, fields, fieldCode) = ReadFields(identity.WindowHandle);
        if (fieldCode != "ok") return new(false, fieldCode);
        var (selection, locateCode) = LoginFieldLocator.Locate(fields, request.UsernameSelector, request.PasswordSelector);
        if (selection is null) return new(false, locateCode);

        try
        {
            if (!SetValue(elements[selection.UsernameIndex], request.Username)) return new(false, "field-read-only");
            if (!SetValue(elements[selection.PasswordIndex], request.Password)) return new(false, "field-read-only", 1);
            return new(true, "filled", 2);
        }
        catch (ElementNotAvailableException)
        {
            return new(false, "foreground-changed");
        }
        catch (InvalidOperationException)
        {
            return new(false, "field-write-failed");
        }
    }

    public AutomationResult Paste(DesktopPasteRequest request)
    {
        var (identity, identityCode) = inspector.Inspect();
        if (identity is null) return new(false, identityCode);
        if (!PathsEqual(identity.ExecutablePath, request.ExpectedExecutablePath)) return new(false, "foreground-changed");
        if (!MatchesTitle(request.WindowTitlePattern, identity.WindowTitle)) return new(false, "window-title-mismatch");
        try
        {
            if (!SendChord(0x11, 0x56)) return new(false, "keystroke-failed");
            if (request.PressTabAfter && !SendKey(0x09)) return new(false, "keystroke-failed", 1);
            return new(true, "pasted", 1);
        }
        catch
        {
            return new(false, "keystroke-failed");
        }
    }

    private static bool SendChord(ushort modifier, ushort key)
    {
        var inputs = new[]
        {
            KeyInput(modifier, false), KeyInput(key, false), KeyInput(key, true), KeyInput(modifier, true),
        };
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>()) == inputs.Length;
    }

    private static bool SendKey(ushort key)
    {
        var inputs = new[] { KeyInput(key, false), KeyInput(key, true) };
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>()) == inputs.Length;
    }

    private static Input KeyInput(ushort virtualKey, bool keyUp) => new()
    {
        Type = 1,
        Data = new InputUnion
        {
            Keyboard = new KeyboardInput { VirtualKey = virtualKey, Flags = keyUp ? 0x0002u : 0u },
        },
    };

    [StructLayout(LayoutKind.Sequential)]
    private struct Input { public uint Type; public InputUnion Data; }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MouseInput Mouse;
        [FieldOffset(0)] public KeyboardInput Keyboard;
        [FieldOffset(0)] public HardwareInput Hardware;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X; public int Y; public uint MouseData; public uint Flags; public uint Time; public IntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey; public ushort ScanCode; public uint Flags; public uint Time; public IntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HardwareInput { public uint Message; public ushort ParameterLow; public ushort ParameterHigh; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint inputCount, Input[] inputs, int inputSize);

    private static (List<AutomationElement> Elements, List<AutomationFieldCandidate> Fields, string Code) ReadFields(long windowHandle)
    {
        try
        {
            var root = AutomationElement.FromHandle(new IntPtr(windowHandle));
            var collection = root.FindAll(TreeScope.Descendants, new PropertyCondition(
                AutomationElement.ControlTypeProperty, ControlType.Edit));
            var elements = new List<AutomationElement>();
            var fields = new List<AutomationFieldCandidate>();
            for (var index = 0; index < collection.Count; index++)
            {
                var element = collection[index];
                var supportsValue = element.TryGetCurrentPattern(ValuePattern.Pattern, out _);
                elements.Add(element);
                fields.Add(new AutomationFieldCandidate(
                    element.Current.AutomationId ?? string.Empty,
                    element.Current.Name ?? string.Empty,
                    element.Current.IsPassword,
                    element.Current.IsEnabled,
                    supportsValue,
                    element.Current.HasKeyboardFocus,
                    index));
            }
            return (elements, fields, fields.Count == 0 ? "fields-not-found" : "ok");
        }
        catch (UnauthorizedAccessException)
        {
            return ([], [], "automation-access-denied");
        }
        catch (ElementNotAvailableException)
        {
            return ([], [], "foreground-changed");
        }
    }

    private static bool SetValue(AutomationElement element, string value)
    {
        if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern)) return false;
        var valuePattern = (ValuePattern)pattern;
        if (valuePattern.Current.IsReadOnly) return false;
        valuePattern.SetValue(value);
        return true;
    }

    private static bool PathsEqual(string left, string right)
    {
        try
        {
            return string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool MatchesTitle(string? pattern, string title)
    {
        if (string.IsNullOrEmpty(pattern)) return true;
        if (pattern.Length > 128) return false;
        try
        {
            return Regex.IsMatch(title, pattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (RegexMatchTimeoutException)
        {
            return false;
        }
    }
}
