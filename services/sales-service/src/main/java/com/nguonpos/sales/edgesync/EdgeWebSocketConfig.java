package com.nguonpos.sales.edgesync;

import com.nguonpos.sales.device.EdgeDeviceAuth;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/** /edge/v1/ws — accepted only for an enrolled, active till presenting its certificate. */
@Configuration
@EnableWebSocket
public class EdgeWebSocketConfig implements WebSocketConfigurer {

    private final EdgeSyncHandler handler;
    private final EdgeDeviceAuth auth;

    public EdgeWebSocketConfig(EdgeSyncHandler handler, EdgeDeviceAuth auth) {
        this.handler = handler;
        this.auth = auth;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/edge/v1/ws").addInterceptors(new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(ServerHttpRequest req, ServerHttpResponse res, WebSocketHandler h, Map<String, Object> attributes) {
                var device = auth.resolve(name -> req.getHeaders().getFirst(name));
                if (device.isEmpty()) {
                    res.setStatusCode(HttpStatus.FORBIDDEN);
                    return false;
                }
                attributes.put(EdgeSyncHandler.DEVICE, device.get());
                return true;
            }

            @Override
            public void afterHandshake(ServerHttpRequest req, ServerHttpResponse res, WebSocketHandler h, Exception e) {
            }
        });
    }
}
