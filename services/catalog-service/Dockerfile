FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app
# Force IPv4 — see auth-service/Dockerfile for why.
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
