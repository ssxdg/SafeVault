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

    public VaultPipeClient(string? configPath = null, TimeSpan? timeout = null)
    {
        this.configPath = configPath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SafeVault",
            "bridge.json");
        this.timeout = timeout ?? TimeSpan.FromSeconds(3);
    }

    public async Task<BridgeResponse> SendAsync(BridgeRequest request, CancellationToken cancellationToken = default)
    {
        var config = await LoadConfigAsync(cancellationToken);
        var protectedToken = Convert.FromBase64String(config.ProtectedToken);
        var token = Encoding.UTF8.GetString(ProtectedData.Unprotect(
            protectedToken,
            null,
            DataProtectionScope.CurrentUser));

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        await using var pipe = new NamedPipeClientStream(
            ".",
            config.PipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);
        await pipe.ConnectAsync(timeoutSource.Token);

        await using var writer = new StreamWriter(pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
        var envelope = JsonSerializer.Serialize(new { token, request }, JsonOptions);
        await writer.WriteLineAsync(envelope.AsMemory(), timeoutSource.Token);
        var responseLine = await reader.ReadLineAsync(timeoutSource.Token)
            ?? throw new EndOfStreamException("SafeVault 管道未返回响应。");
        return JsonSerializer.Deserialize<BridgeResponse>(responseLine, JsonOptions)
            ?? throw new InvalidDataException("SafeVault 管道响应无效。");
    }

    private async Task<BridgeConfig> LoadConfigAsync(CancellationToken cancellationToken)
    {
        var json = await File.ReadAllTextAsync(configPath, cancellationToken);
        var config = JsonSerializer.Deserialize<BridgeConfig>(json, JsonOptions);
        if (config is null || string.IsNullOrWhiteSpace(config.PipeName) || string.IsNullOrWhiteSpace(config.ProtectedToken))
            throw new InvalidDataException("SafeVault Bridge 配置无效。");
        return config;
    }

    private sealed record BridgeConfig(string PipeName, string ProtectedToken);
}
