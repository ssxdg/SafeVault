using System.Buffers.Binary;
using System.Text;
using SafeVault.Bridge.Protocol;

namespace SafeVault.Bridge.Tests;

public sealed class NativeMessageCodecTests
{
    [Fact]
    public async Task RejectsZeroLengthMessage()
    {
        await using var stream = new MemoryStream(new byte[4]);
        await Assert.ThrowsAsync<InvalidDataException>(() => NativeMessageCodec.ReadRequestAsync(stream));
    }

    [Fact]
    public async Task RejectsOversizedMessage()
    {
        var prefix = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(prefix, NativeMessageCodec.MaxMessageBytes + 1u);
        await using var stream = new MemoryStream(prefix);
        await Assert.ThrowsAsync<InvalidDataException>(() => NativeMessageCodec.ReadRequestAsync(stream));
    }

    [Fact]
    public async Task RejectsTruncatedMessage()
    {
        var bytes = new byte[6];
        BinaryPrimitives.WriteUInt32LittleEndian(bytes, 12);
        await using var stream = new MemoryStream(bytes);
        await Assert.ThrowsAsync<EndOfStreamException>(() => NativeMessageCodec.ReadRequestAsync(stream));
    }

    [Fact]
    public async Task RejectsInvalidJson()
    {
        await using var stream = Frame("{not-json");
        await Assert.ThrowsAsync<InvalidDataException>(() => NativeMessageCodec.ReadRequestAsync(stream));
    }

    [Fact]
    public async Task RejectsUnknownAction()
    {
        await using var stream = Frame("{\"requestId\":\"req-1\",\"action\":\"deleteEverything\",\"origin\":\"https://example.com\"}");
        await Assert.ThrowsAsync<InvalidDataException>(() => NativeMessageCodec.ReadRequestAsync(stream));
    }

    [Fact]
    public async Task RoundTripsRequestAndResponse()
    {
        var request = new BridgeRequest("req-2", "listCredentials", "https://example.com", null, null);
        await using var requestStream = new MemoryStream();
        await NativeMessageCodec.WriteAsync(requestStream, request);
        requestStream.Position = 0;
        Assert.Equal(request, await NativeMessageCodec.ReadRequestAsync(requestStream));

        var response = new BridgeResponse("req-2", true, "OK", new { count = 1 });
        await using var responseStream = new MemoryStream();
        await NativeMessageCodec.WriteAsync(responseStream, response);
        var bytes = responseStream.ToArray();
        Assert.Equal(bytes.Length - 4, BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(0, 4)));
        Assert.Contains("\"requestId\":\"req-2\"", Encoding.UTF8.GetString(bytes, 4, bytes.Length - 4));
    }

    private static MemoryStream Frame(string json)
    {
        var payload = Encoding.UTF8.GetBytes(json);
        var bytes = new byte[payload.Length + 4];
        BinaryPrimitives.WriteInt32LittleEndian(bytes, payload.Length);
        payload.CopyTo(bytes, 4);
        return new MemoryStream(bytes);
    }
}
