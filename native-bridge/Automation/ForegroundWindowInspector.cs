using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace SafeVault.Bridge.Automation;

public sealed class ForegroundWindowInspector
{
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private const uint TokenQuery = 0x0008;
    private const int TokenIntegrityLevel = 25;

    public (AppIdentity? Identity, string Code) Inspect()
    {
        var windowHandle = GetForegroundWindow();
        if (windowHandle == IntPtr.Zero) return (null, "no-foreground-window");

        _ = GetWindowThreadProcessId(windowHandle, out var processId);
        if (processId == 0 || processId == Environment.ProcessId) return (null, "unsafe-target");

        var processHandle = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (processHandle == IntPtr.Zero) return (null, "process-access-denied");
        try
        {
            var pathBuffer = new StringBuilder(32768);
            var pathLength = pathBuffer.Capacity;
            if (!QueryFullProcessImageName(processHandle, 0, pathBuffer, ref pathLength))
                return (null, "process-path-unavailable");

            var targetIntegrity = GetIntegrityLevel(processHandle);
            using var currentProcess = Process.GetCurrentProcess();
            var currentIntegrity = GetIntegrityLevel(currentProcess.Handle);
            if (targetIntegrity < 0 || currentIntegrity < 0 || targetIntegrity > currentIntegrity)
                return (null, "elevated-target-denied");

            var titleLength = GetWindowTextLength(windowHandle);
            var titleBuffer = new StringBuilder(Math.Max(titleLength + 1, 1));
            _ = GetWindowText(windowHandle, titleBuffer, titleBuffer.Capacity);
            return (new AppIdentity(
                Path.GetFullPath(pathBuffer.ToString()),
                checked((int)processId),
                titleBuffer.ToString(),
                targetIntegrity,
                windowHandle.ToInt64()), "ok");
        }
        finally
        {
            _ = CloseHandle(processHandle);
        }
    }

    private static int GetIntegrityLevel(IntPtr processHandle)
    {
        if (!OpenProcessToken(processHandle, TokenQuery, out var tokenHandle)) return -1;
        try
        {
            _ = GetTokenInformation(tokenHandle, TokenIntegrityLevel, IntPtr.Zero, 0, out var requiredLength);
            if (requiredLength <= 0) return -1;
            var buffer = Marshal.AllocHGlobal(requiredLength);
            try
            {
                if (!GetTokenInformation(tokenHandle, TokenIntegrityLevel, buffer, requiredLength, out _)) return -1;
                var label = Marshal.PtrToStructure<TokenMandatoryLabel>(buffer);
                var countPointer = GetSidSubAuthorityCount(label.Label.Sid);
                if (countPointer == IntPtr.Zero) return -1;
                var count = Marshal.ReadByte(countPointer);
                if (count == 0) return -1;
                var ridPointer = GetSidSubAuthority(label.Label.Sid, (uint)(count - 1));
                return ridPointer == IntPtr.Zero ? -1 : Marshal.ReadInt32(ridPointer);
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        finally
        {
            _ = CloseHandle(tokenHandle);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SidAndAttributes { public IntPtr Sid; public uint Attributes; }

    [StructLayout(LayoutKind.Sequential)]
    private struct TokenMandatoryLabel { public SidAndAttributes Label; }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr windowHandle, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr windowHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr processHandle, uint flags, StringBuilder path, ref int size);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(IntPtr tokenHandle, int informationClass, IntPtr tokenInformation, int tokenInformationLength, out int returnLength);

    [DllImport("advapi32.dll")]
    private static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);

    [DllImport("advapi32.dll")]
    private static extern IntPtr GetSidSubAuthority(IntPtr sid, uint subAuthority);
}
