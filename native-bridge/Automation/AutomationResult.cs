namespace SafeVault.Bridge.Automation;

public sealed record AutomationResult(
    bool Success,
    string Code,
    int FilledFields = 0,
    string? Message = null,
    AppIdentity? AppIdentity = null,
    IReadOnlyList<AutomationFieldCandidate>? Fields = null);

public sealed record AppIdentity(
    string ExecutablePath,
    int ProcessId,
    string WindowTitle,
    int IntegrityLevel,
    long WindowHandle);

public sealed record AutomationFieldCandidate(
    string AutomationId,
    string Name,
    bool IsPassword,
    bool IsEnabled,
    bool SupportsValue,
    bool HasKeyboardFocus,
    int Order);

public sealed record FieldSelector(string? AutomationId = null, string? Name = null);

public sealed record FieldSelection(int UsernameIndex, int PasswordIndex);
