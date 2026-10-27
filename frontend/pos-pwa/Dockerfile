FROM node:20-alpine AS build
WORKDIR /app
# Force IPv4 — same Docker-build IPv6-blackhole issue as the Spring Boot
# services' Maven downloads (see services/*/Dockerfile), just surfacing
# here as npm's install hanging/timing out instead of Maven's. Without
# this, npm can also fail with an internal "Exit handler never called!"
# error that — worse — doesn't fail the RUN step, silently leaving
# node_modules empty until `tsc` turns up missing two steps later.
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
