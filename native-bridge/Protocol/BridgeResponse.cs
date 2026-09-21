using System.Text.Json.Serialization;

namespace SafeVault.Bridge.Protocol;

public sealed record BridgeResponse(
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("data")] object? Data = null);
