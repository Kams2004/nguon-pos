package com.nguonpos.sales.config;

import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // /error deliberately permitted: an unhandled exception
                        // triggers an internal forward to it, and without this
                        // the forward itself gets denied by the authenticated()
                        // rule below — surfacing every server error as a
                        // misleading 403 instead of its real status. (Found the
                        // hard way — this hid a real bug's actual error for a
                        // long time during testing.)
                        .requestMatchers("/actuator/health/**", "/error").permitAll()
                        // The live stream (/sales/events) completes on an async
                        // dispatch; the original request was already
                        // authenticated, and the async re-dispatch carries no
                        // Authorization header to re-check.
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
