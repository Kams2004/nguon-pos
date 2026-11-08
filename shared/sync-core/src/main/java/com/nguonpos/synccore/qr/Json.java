package com.nguonpos.synccore.qr;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The little JSON a QR payload needs, kept dependency-free: writing strings
 * exactly like ECMAScript's JSON.stringify, and reading one flat object of
 * strings and numbers. Anything else is rejected rather than guessed at.
 */
final class Json {

    private Json() {
    }

    /** JSON.stringify string escaping (ES2019 "well-formed" variant). */
    static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    boolean lone = Character.isHighSurrogate(c)
                            ? !(i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1)))
                            : Character.isLowSurrogate(c) && !(i > 0 && Character.isHighSurrogate(s.charAt(i - 1)));
                    if (c < 0x20 || lone) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    /** Parses {@code {"k": "str" | number, ...}}; throws IllegalArgumentException on anything else. */
    static Map<String, Object> parseFlatObject(String text) {
        Parser p = new Parser(text);
        p.ws();
        p.expect('{');
        Map<String, Object> out = new LinkedHashMap<>();
        p.ws();
        if (p.peek() == '}') {
            p.pos++;
        } else {
            while (true) {
                p.ws();
                String key = p.string();
                p.ws();
                p.expect(':');
                p.ws();
                out.put(key, p.peek() == '"' ? p.string() : p.number());
                p.ws();
                char c = p.next();
                if (c == '}') break;
                if (c != ',') throw new IllegalArgumentException("',' or '}' expected");
            }
        }
        p.ws();
        if (p.pos != text.length()) throw new IllegalArgumentException("trailing content");
        return out;
    }

    private static final class Parser {
        final String s;
        int pos;

        Parser(String s) {
            this.s = s;
        }

        char peek() {
            if (pos >= s.length()) throw new IllegalArgumentException("unexpected end");
            return s.charAt(pos);
        }

        char next() {
            char c = peek();
            pos++;
            return c;
        }

        void expect(char c) {
            if (next() != c) throw new IllegalArgumentException("'" + c + "' expected");
        }

        void ws() {
            while (pos < s.length() && " \t\n\r".indexOf(s.charAt(pos)) >= 0) pos++;
        }

        String string() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') return sb.toString();
                if (c < 0x20) throw new IllegalArgumentException("control character in string");
                if (c != '\\') {
                    sb.append(c);
                    continue;
                }
                char e = next();
                switch (e) {
                    case '"', '\\', '/' -> sb.append(e);
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        if (pos + 4 > s.length()) throw new IllegalArgumentException("bad \\u escape");
                        sb.append((char) Integer.parseInt(s.substring(pos, pos + 4), 16));
                        pos += 4;
                    }
                    default -> throw new IllegalArgumentException("bad escape");
                }
            }
        }

        Number number() {
            int start = pos;
            while (pos < s.length() && "+-0123456789.eE".indexOf(s.charAt(pos)) >= 0) pos++;
            String n = s.substring(start, pos);
            if (n.isEmpty()) throw new IllegalArgumentException("value must be a string or a number");
            return n.matches("-?\\d+") ? (Number) Long.parseLong(n) : (Number) Double.parseDouble(n);
        }
    }
}
