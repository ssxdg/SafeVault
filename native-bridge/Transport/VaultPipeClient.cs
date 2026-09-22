using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SafeVault.Bridge.Protocol;

namespace SafeVault.Bridge.Transport;

public sealed class VaultPipeClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string configPath;
    private readonly TimeSpan timeout;
    private readonly Func<string, bool> startApplication;
    private readonly TimeSpan initialConnectTimeout;
    private readonly TimeSpan startupTimeout;

    public VaultPipeClient(
        string? configPath = null,
        TimeSpan? timeout = null,
        Func<string, bool>? startApplication = null,
        TimeSpan? initialConnectTimeout = null,
        TimeSpan? startupTimeout = null)
    {
        this.configPath = configPath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SafeVault",
            "bridge.json");
        this.timeout = timeout ?? TimeSpan.FromSeconds(3);
        this.startApplication = startApplication ?? StartApplication;
        this.initialConnectTimeout = initialConnectTimeout ?? TimeSpan.FromMilliseconds(250);
        this.startupTimeout = startupTimeout ?? TimeSpan.FromSeconds(10);
    }

    public async Task<BridgeResponse> SendAsync(BridgeRequest request, CancellationToken cancellationToken = default)
    {
        var config = await LoadConfigAsync(cancellationToken);
        var token = UnprotectToken(config.ProtectedToken);

        NamedPipeClientStream pipe;
        try
        {
            pipe = await ConnectAsync(config.PipeName, initialConnectTimeout, cancellationToken);
        }
        catch (Exception error) when (!cancellationToken.IsCancellationRequested
            && error is OperationCanceledException or TimeoutException or IOException)
        {
            if (string.IsNullOrWhiteSpace(config.AppPath) || !startApplication(config.AppPath)) throw;
            pipe = await ConnectAsync(config.PipeName, startupTimeout, cancellationToken);
            config = await LoadConfigAsync(cancellationToken);
            token = UnprotectToken(config.ProtectedToken);
        }

        await using (pipe)
        using (var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
        {
            timeoutSource.CancelAfter(timeout);
            await using var writer = new StreamWriter(pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
            using var reader = new StreamReader(pipe, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
            var envelope = JsonSerializer.Serialize(new { token, request }, JsonOptions);
            await writer.WriteLineAsync(envelope.AsMemory(), timeoutSource.Token);
            var responseLine = await reader.ReadLineAsync(timeoutSource.Token)
                ?? throw new EndOfStreamException("SafeVault 管道未返回响应。");
            return JsonSerializer.Deserialize<BridgeResponse>(responseLine, JsonOptions)
                ?? throw new InvalidDataException("SafeVault 管道响应无效。");
        }
    }

    private static string UnprotectToken(string protectedToken)
    {
        var protectedBytes = Convert.FromBase64String(protectedToken);
        return Encoding.UTF8.GetString(ProtectedData.Unprotect(
            protectedBytes,
            null,
            DataProtectionScope.CurrentUser));
    }

    private static async Task<NamedPipeClientStream> ConnectAsync(
        string pipeName,
        TimeSpan connectTimeout,
        CancellationToken cancellationToken)
    {
        var pipe = new NamedPipeClientStream(
            ".",
            pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(connectTimeout);
        try
        {
            await pipe.ConnectAsync(timeoutSource.Token);
            return pipe;
        }
        catch
        {
            await pipe.DisposeAsync();
            throw;
        }
    }

    private static bool StartApplication(string appPath)
    {
        if (!Path.IsPathFullyQualified(appPath)
            || !string.Equals(Path.GetExtension(appPath), ".exe", StringComparison.OrdinalIgnoreCase)
            || !File.Exists(appPath))
        {
            return false;
        }

        var process = Process.Start(new ProcessStartInfo
        {
            FileName = appPath,
            WorkingDirectory = Path.GetDirectoryName(appPath) ?? string.Empty,
            UseShellExecute = true,
        });
        return process is not null;
    }

    private async Task<BridgeConfig> LoadConfigAsync(CancellationToken cancellationToken)
    {
        var json = await File.ReadAllTextAsync(configPath, cancellationToken);
        var config = JsonSerializer.Deserialize<BridgeConfig>(json, JsonOptions);
        if (config is null || string.IsNullOrWhiteSpace(config.PipeName) || string.IsNullOrWhiteSpace(config.ProtectedToken))
            throw new InvalidDataException("SafeVault Bridge 配置无效。");
        return config;
    }

    private sealed record BridgeConfig(string PipeName, string ProtectedToken, string? AppPath);
}
