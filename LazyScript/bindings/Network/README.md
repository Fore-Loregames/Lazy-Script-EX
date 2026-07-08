# Native networking

`WinSockRaw.lsx` contains the direct WinSock2 imports. `Sockets.lsx` wraps those imports in a separate namespace so object methods such as `connect`, `listen`, `send`, and `shutdown` cannot shadow the native entry points.


The networking modules call Windows networking APIs directly and use ordinary LSX strings, objects, and typed tables. Game code does not allocate native address structures or manually write byte offsets.

## TCP and UDP sockets

```lsx
use "@LazyScript/bindings/Network/Sockets.lsx" as Sockets

fn main()
    if not Sockets.initialize() then return 1 end

    local socket = Sockets.Socket.connect("127.0.0.1","7777")
    if socket.valid() then
        socket.send_text("hello",0)
        local reply = socket.receive(4096,0)
        reply.destroy()
        socket.close()
    end

    socket.destroy()
    Sockets.cleanup()
    return 0
end
```

The module includes:

- IPv4/IPv6 DNS resolution through `getaddrinfo`.
- TCP connect, listen, accept, send, send-all, receive, and receive-exact.
- UDP creation, bind, send-to, receive-from, sender endpoint capture, and direct datagram replies.
- Blocking and nonblocking sockets.
- TCP no-delay, UDP broadcast, address reuse, shutdown, and close.
- Native `WSAPoll` readable/writable waits.
- WinSock error reporting and common error constants.

For UDP servers that need the sender address, use `receive_datagram()`. It returns a `Datagram` containing the received bytes, numeric host/service text, and the native endpoint required by `socket.reply(packet,data,flags)`. The endpoint storage remains internal to the binding.

Call `Sockets.initialize()` once during application startup and balance it with `Sockets.cleanup()` during shutdown. A library may call it more than once because WinSock maintains an internal startup count, but each successful startup still needs a matching cleanup.

## HTTP and HTTPS

```lsx
use "@LazyScript/bindings/Network/Http.lsx" as Http

fn main()
    local client = Http.Client.create("MyGame/1.0")
    client.set_timeout(15000)

    local response = client.get_port("127.0.0.1","/lsx-test",false,39192)
    if response.succeeded() then
        local text = response.text()
    end

    response.close()
    response.destroy()
    client.close()
    client.destroy()
    return 0
end
```

`Http.Client` is backed directly by WinHTTP and supports HTTP/HTTPS GET, binary POST, text/JSON POST, custom headers, ports, status codes, response bytes, UTF-8 response text, and timeouts. Calls are intentionally blocking at this layer. Run them on a real LSX worker thread when a request must not block the frame loop.
