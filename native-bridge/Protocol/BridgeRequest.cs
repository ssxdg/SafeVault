using System.Text.Json.Serialization;

namespace SafeVault.Bridge.Protocol;

public sealed record BridgeRequest(
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("origin")] string? Origin,
    [property: JsonPropertyName("accountId")] string? AccountId,
    [property: JsonPropertyName("success")] bool? Success,
    [property: JsonPropertyName("newPassword")] string? NewPassword = null)
{
    private static readonly HashSet<string> AllowedActions =
    [
        "listCredentials",
        "getCredential",
        "reportFillResult",
        "updateCredential",
    ];

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(RequestId) || RequestId.Length > 128)
            throw new InvalidDataException("requestId 无效。");
        if (!AllowedActions.Contains(Action))
            throw new InvalidDataException("未知 action。");
        if (string.IsNullOrWhiteSpace(Origin) || !Uri.TryCreate(Origin, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidDataException("origin 无效。");
        if ((Action is "getCredential" or "reportFillResult" or "updateCredential") && string.IsNullOrWhiteSpace(AccountId))
            throw new InvalidDataException("该 action 需要 accountId。");
        if (Action == "reportFillResult" && Success is null)
            throw new InvalidDataException("reportFillResult 需要 success。");
        if (Action == "updateCredential" && (string.IsNullOrEmpty(NewPassword) || NewPassword.Length > 4096))
            throw new InvalidDataException("updateCredential 需要有效的 newPassword。");
    }
}
