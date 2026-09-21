using System.Buffers.Binary;
using System.Text.Json;

namespace SafeVault.Bridge.Protocol;

public static class NativeMessageCodec
{
    public const uint MaxMessageBytes = 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task<BridgeRequest> ReadRequestAsync(Stream input, CancellationToken cancellationToken = default)
    {
        var request = await ReadAsync<BridgeRequest>(input, cancellationToken);
        request.Validate();
        return request;
    }

    public static async Task<T> ReadAsync<T>(Stream input, CancellationToken cancellationToken = default)
    {
        var prefix = new byte[4];
        await ReadExactlyAsync(input, prefix, cancellationToken);
        var length = BinaryPrimitives.ReadUInt32LittleEndian(prefix);
        if (length == 0 || length > MaxMessageBytes)
            throw new InvalidDataException("Native Messaging 消息长度无效。");

        var payload = new byte[length];
        await ReadExactlyAsync(input, payload, cancellationToken);
        try
        {
            return JsonSerializer.Deserialize<T>(payload, JsonOptions)
                ?? throw new InvalidDataException("Native Messaging JSON 为空。");
        }
        catch (JsonException error)
        {
            throw new InvalidDataException("Native Messaging JSON 无效。", error);
        }
    }

    public static async Task WriteAsync<T>(Stream output, T message, CancellationToken cancellationToken = default)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions);
        if (payload.Length == 0 || payload.Length > MaxMessageBytes)
            throw new InvalidDataException("Native Messaging 响应长度无效。");

        var prefix = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(prefix, payload.Length);
        await output.WriteAsync(prefix, cancellationToken);
        await output.WriteAsync(payload, cancellationToken);
        await output.FlushAsync(cancellationToken);
    }

    private static async Task ReadExactlyAsync(Stream input, Memory<byte> buffer, CancellationToken cancellationToken)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = await input.ReadAsync(buffer[offset..], cancellationToken);
            if (read == 0) throw new EndOfStreamException("Native Messaging 消息被截断。");
            offset += read;
        }
    }
}
