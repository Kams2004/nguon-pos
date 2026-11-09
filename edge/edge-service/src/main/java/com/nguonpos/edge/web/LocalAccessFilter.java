package com.nguonpos.edge.web;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.core.LocalAuth;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Gatekeeper of the local API (/local/v1/**):
 * 1. Host must be this machine's loopback address and port — a page on the
 *    internet resolving its own domain to 127.0.0.1 (DNS rebinding) is refused.
 * 2. A browser Origin, if present, must be the desktop app's (CORS).
 * 3. X-Edge-Ui-Token must match the token file only the installed app reads.
 * 4. Except to log in or read the status, a valid session (Bearer) is required;
 *    the logged-in user is put on the request for controllers.
 */
@Component
@Order(1)
public class LocalAccessFilter extends OncePerRequestFilter {

    public static final String USER = "edge.user";
    public static final String TOKEN = "edge.session";
    private static final Set<String> NO_SESSION = Set.of("/local/v1/status", "/local/v1/auth/login", "/local/v1/enroll");

    private final EdgeProperties props;
    private final UiToken uiToken;
    private final LocalAuth auth;

    public LocalAccessFilter(EdgeProperties props, UiToken uiToken, LocalAuth auth) {
        this.props = props;
        this.uiToken = uiToken;
        this.auth = auth;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/local/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String host = req.getHeader("Host");
        int port = req.getLocalPort();
        if (host == null || !(host.equals("127.0.0.1:" + port) || host.equals("localhost:" + port))) {
            res.sendError(HttpServletResponse.SC_FORBIDDEN, "Host not allowed");
            return;
        }
        String origin = req.getHeader("Origin");
        if (origin != null) {
            if (!props.allowedOrigins().contains(origin)) {
                res.sendError(HttpServletResponse.SC_FORBIDDEN, "Origin not allowed");
                return;
            }
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
            if ("OPTIONS".equals(req.getMethod())) {
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
                res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Edge-Ui-Token");
                res.setHeader("Access-Control-Max-Age", "600");
                res.setStatus(HttpServletResponse.SC_NO_CONTENT);
                return;
            }
        }
        if (!uiToken.matches(req.getHeader("X-Edge-Ui-Token"))) {
            res.sendError(HttpServletResponse.SC_UNAUTHORIZED, "UI token required");
            return;
        }
        if (!NO_SESSION.contains(req.getRequestURI())) {
            String authz = req.getHeader("Authorization");
            String session = authz != null && authz.startsWith("Bearer ") ? authz.substring(7) : null;
            var user = auth.userForSession(session);
            if (user.isEmpty()) {
                res.sendError(HttpServletResponse.SC_UNAUTHORIZED, "SESSION_REQUIRED");
                return;
            }
            req.setAttribute(USER, user.get());
            req.setAttribute(TOKEN, session);
        }
        chain.doFilter(req, res);
    }
}
