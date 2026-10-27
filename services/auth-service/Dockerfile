FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
# Force IPv4 — a Docker build container resolving Maven Central to an IPv6
# address can silently hang mid-download for a long time if that path is
# blackholed, with zero CPU/error signal. Seen exactly once building this
# project; fixed here so a rebuild never depends on the host's IPv6 health.
ENV MAVEN_OPTS="-Djava.net.preferIPv4Stack=true"
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jdk-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
