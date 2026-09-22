using SafeVault.Bridge.Protocol;
using SafeVault.Bridge.Transport;
using SafeVault.Bridge.Automation;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true,
};

if (args.Length == 1 && args[0] == "protect-token")
{
    var token = await Console.In.ReadToEndAsync();
    if (string.IsNullOrWhiteSpace(token) || token.Length > 4096)
        throw new InvalidDataException("Invalid bridge token.");
    var protectedBytes = ProtectedData.Protect(
        Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser);
    Console.Write(Convert.ToBase64String(protectedBytes));
    return;
}

if (args.Length == 1 && args[0] == "desktop-inspect")
{
    var result = new CredentialFiller(new ForegroundWindowInspector()).InspectFields();
    Console.Write(JsonSerializer.Serialize(result, jsonOptions));
    return;
}

if (args.Length == 1 && args[0] == "desktop-fill")
{
    AutomationResult result;
    try
    {
        var requestJson = await Console.In.ReadToEndAsync();
        var request = JsonSerializer.Deserialize<DesktopFillRequest>(requestJson, jsonOptions)
            ?? throw new InvalidDataException("Desktop fill request is empty.");
        result = new CredentialFiller(new ForegroundWindowInspector()).Fill(request);
    }
    catch
    {
        result = new AutomationResult(false, "invalid-request");
    }
    Console.Write(JsonSerializer.Serialize(result, jsonOptions));
    return;
}

if (args.Length == 1 && args[0] == "desktop-paste")
{
    AutomationResult result;
    try
    {
        var requestJson = await Console.In.ReadToEndAsync();
        var request = JsonSerializer.Deserialize<DesktopPasteRequest>(requestJson, jsonOptions)
            ?? throw new InvalidDataException("Desktop paste request is empty.");
        result = new CredentialFiller(new ForegroundWindowInspector()).Paste(request);
    }
    catch
    {
        result = new AutomationResult(false, "invalid-request");
    }
    Console.Write(JsonSerializer.Serialize(result, jsonOptions));
    return;
}

var input = Console.OpenStandardInput();
var output = Console.OpenStandardOutput();
var pipeClient = new VaultPipeClient();

while (true)
{
    BridgeRequest request;
    try
    {
        request = await NativeMessageCodec.ReadRequestAsync(input);
    }
    catch (EndOfStreamException)
    {
        break;
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"Invalid native message: {error.Message}");
        break;
    }

    BridgeResponse response;
    try
    {
        response = await pipeClient.SendAsync(request);
    }
    catch (OperationCanceledException)
    {
        response = new BridgeResponse(request.RequestId, false, "TIMEOUT");
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"Bridge request failed: {error.Message}");
        response = new BridgeResponse(request.RequestId, false, "APP_UNAVAILABLE");
    }
    await NativeMessageCodec.WriteAsync(output, response);
}
