using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SafeVault.Bridge.Protocol;
using SafeVault.Bridge.Transport;

namespace SafeVault.Bridge.Tests;

public sealed class VaultPipeClientTests
{
    [Fact]
    public async Task SendAsyncStartsConfiguredAppWhenPipeIsUnavailable()
    {
        var directory = Directory.CreateTempSubdirectory("safevault-pipe-client-");
        try
        {
            var appPath = Path.Combine(directory.FullName, "SafeVault.exe");
            await File.WriteAllTextAsync(appPath, string.Empty);
            var pipeName = $"safevault-test-{Guid.NewGuid():N}";
            const string initialToken = "initial-session-token";
            const string refreshedToken = "refreshed-session-token";
            var protectedToken = Convert.ToBase64String(ProtectedData.Protect(
                Encoding.UTF8.GetBytes(initialToken),
                null,
                DataProtectionScope.CurrentUser));
            var configPath = Path.Combine(directory.FullName, "bridge.json");
            await File.WriteAllTextAsync(configPath, JsonSerializer.Serialize(new
            {
                pipeName,
                protectedToken,
                appPath,
            }));

            string? launchedPath = null;
            Task? serverTask = null;
            bool StartApplication(string path)
            {
                launchedPath = path;
                var refreshedProtectedToken = Convert.ToBase64String(ProtectedData.Protect(
                    Encoding.UTF8.GetBytes(refreshedToken),
                    null,
                    DataProtectionScope.CurrentUser));
                File.WriteAllText(configPath, JsonSerializer.Serialize(new
                {
                    pipeName,
                    protectedToken = refreshedProtectedToken,
                    appPath,
                }));
                serverTask = Task.Run(async () =>
                {
                    await using var server = new NamedPipeServerStream(
                        pipeName,
                        PipeDirection.InOut,
                        1,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous);
                    await server.WaitForConnectionAsync();
                    using var reader = new StreamReader(server, Encoding.UTF8, false, leaveOpen: true);
                    await using var writer = new StreamWriter(server, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
                    var envelope = JsonDocument.Parse((await reader.ReadLineAsync())!);
                    Assert.Equal(refreshedToken, envelope.RootElement.GetProperty("token").GetString());
                    await writer.WriteLineAsync("{\"requestId\":\"request-1\",\"ok\":false,\"code\":\"LOCKED\"}");
                });
                return true;
            }

            var client = new VaultPipeClient(
                configPath,
                timeout: TimeSpan.FromSeconds(2),
                startApplication: StartApplication,
                initialConnectTimeout: TimeSpan.FromMilliseconds(50),
                startupTimeout: TimeSpan.FromSeconds(2));
            var response = await client.SendAsync(new BridgeRequest(
                "request-1",
                "listCredentials",
                "https://example.com",
                null,
                null));

            Assert.Equal(appPath, launchedPath);
            Assert.Equal("LOCKED", response.Code);
            await serverTask!;
        }
        finally
        {
            directory.Delete(true);
        }
    }
}
