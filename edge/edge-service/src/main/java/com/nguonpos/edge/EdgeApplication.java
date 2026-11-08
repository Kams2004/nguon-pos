package com.nguonpos.edge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * The till's local server: runs as an OS service next to the desktop app,
 * keeps the till's data in an encrypted local database, sells, scans and
 * logs cashiers in without a network, and forwards everything to central
 * when it can.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class EdgeApplication {
    public static void main(String[] args) {
        SpringApplication.run(EdgeApplication.class, args);
    }
}
