package com.nguonpos.sales.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A form that breaks a rule (too short a password, a missing name…) gets a
 * sentence the user can act on — "Mot de passe : 4 caractères minimum" —
 * instead of Spring's "Validation failed for object='createRequest'", in
 * the language the screen asked for (Accept-Language), French by default.
 */
@RestControllerAdvice
public class ValidationErrors {

    private static final Map<String, String[]> LABELS = Map.ofEntries(
            Map.entry("username", new String[]{"Identifiant", "Username"}),
            Map.entry("password", new String[]{"Mot de passe", "Password"}),
            Map.entry("fullName", new String[]{"Nom complet", "Full name"}),
            Map.entry("name", new String[]{"Nom", "Name"}),
            Map.entry("label", new String[]{"Nom", "Name"}),
            Map.entry("code", new String[]{"Code", "Code"}),
            Map.entry("price", new String[]{"Prix", "Price"}),
            Map.entry("role", new String[]{"Rôle", "Role"}),
            Map.entry("version", new String[]{"Version", "Version"}),
            Map.entry("reason", new String[]{"Motif", "Reason"}));

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException ex, HttpServletRequest request, Locale locale) {
        boolean en = locale != null && "en".equals(locale.getLanguage());
        List<String> problems = ex.getBindingResult().getAllErrors().stream().map(e -> describe(e, en)).distinct().toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", 400);
        body.put("error", "Bad Request");
        body.put("message", problems.isEmpty() ? (en ? "Invalid form." : "Formulaire invalide.") : String.join(" ", problems));
        body.put("path", request.getRequestURI());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    static String describe(ObjectError error, boolean en) {
        if (!(error instanceof FieldError fe)) return sentence(error.getDefaultMessage());
        String[] known = LABELS.get(fe.getField());
        String label = known != null ? known[en ? 1 : 0] : humanize(fe.getField());
        String code = fe.getCode() == null ? "" : fe.getCode();
        Map<String, Object> attrs = attributes(fe);
        String text = switch (code) {
            case "NotBlank", "NotNull", "NotEmpty" -> en ? "required." : "obligatoire.";
            case "Size", "Length" -> {
                Object value = fe.getRejectedValue();
                int length = value instanceof CharSequence cs ? cs.length() : value instanceof java.util.Collection<?> c ? c.size() : -1;
                int min = number(attrs.get("min"), 0);
                int max = number(attrs.get("max"), Integer.MAX_VALUE);
                if (length >= 0 && length < min) yield en ? min + " characters minimum." : min + " caractères minimum.";
                if (length > max) yield en ? max + " characters maximum." : max + " caractères maximum.";
                yield en ? "wrong length." : "longueur incorrecte.";
            }
            case "Pattern", "Email" -> en ? "invalid format." : "format invalide.";
            case "Min", "Positive", "PositiveOrZero", "DecimalMin" -> en ? "value too small." : "valeur trop petite.";
            case "Max", "DecimalMax" -> en ? "value too large." : "valeur trop grande.";
            default -> sentence(fe.getDefaultMessage());
        };
        return label + " : " + text;
    }

    private static Map<String, Object> attributes(FieldError fe) {
        try {
            @SuppressWarnings("unchecked")
            ConstraintViolation<Object> v = fe.unwrap(ConstraintViolation.class);
            return v.getConstraintDescriptor().getAttributes();
        } catch (RuntimeException e) {
            return Map.of();
        }
    }

    private static int number(Object o, int fallback) {
        return o instanceof Number n ? n.intValue() : fallback;
    }

    private static String sentence(String s) {
        if (s == null || s.isBlank()) return "";
        return s.endsWith(".") ? s : s + ".";
    }

    /** "assignedGateId" → "Assigned gate id". */
    private static String humanize(String field) {
        String spaced = field.replaceAll("([a-z0-9])([A-Z])", "$1 $2").toLowerCase(Locale.ROOT);
        return spaced.isEmpty() ? field : Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}
