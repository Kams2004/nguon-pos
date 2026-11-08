package com.nguonpos.edge.db;

import com.nguonpos.edge.EdgeProperties;
import com.nguonpos.edge.keys.Keys;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.sqlite.mc.SQLiteMCSqlCipherConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Properties;

/**
 * The till's database: one SQLite file encrypted with SQLCipher (AES-256),
 * keyed from the master key. Write-ahead log + synchronous=FULL so a sale
 * confirmed to the cashier survives a power cut.
 */
@Configuration
public class DatabaseConfig {

    @Bean
    DataSource dataSource(EdgeProperties props) throws IOException {
        Files.createDirectories(props.dataDir());
        byte[] master = Keys.provider(props).masterKey();
        byte[] dbKey = Keys.derive(master, "nguon-edge/sqlcipher");
        Arrays.fill(master, (byte) 0);

        Properties p = SQLiteMCSqlCipherConfig.getV4Defaults().withRawUnsaltedKey(dbKey).build().toProperties();
        p.setProperty("journal_mode", "WAL");
        p.setProperty("synchronous", "FULL");
        p.setProperty("foreign_keys", "true");
        p.setProperty("busy_timeout", "5000");

        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("edge-db");
        cfg.setDriverClassName("org.sqlite.JDBC");
        cfg.setJdbcUrl("jdbc:sqlite:file:" + props.dataDir().resolve("edge.db").toAbsolutePath());
        cfg.setDataSourceProperties(p);
        // SQLite has one writer at a time; a small pool is plenty for one till.
        cfg.setMaximumPoolSize(4);
        return new HikariDataSource(cfg);
    }

    @Bean
    JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean
    PlatformTransactionManager transactionManager(DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }

    @Bean
    TransactionTemplate transactionTemplate(PlatformTransactionManager tm) {
        return new TransactionTemplate(tm);
    }

    @Bean(initMethod = "migrate")
    Migrator migrator(JdbcTemplate jdbc, TransactionTemplate tx) {
        return new Migrator(jdbc, tx);
    }
}
