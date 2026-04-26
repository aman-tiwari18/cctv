-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: cctv_monitoring
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `analytics_tasks`
--

DROP TABLE IF EXISTS `analytics_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `analytics_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `task_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `script_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `frequency_minutes` int NOT NULL,
  `duration_minutes` int DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `parameters` json DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exam_id` (`exam_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `analytics_tasks_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `camera_links`
--

DROP TABLE IF EXISTS `camera_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `camera_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `camera_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Unique camera identifier',
  `stream_url` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'RTSP or HLS stream URL',
  `stream_type` enum('RTSP','HLS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Physical location or room number',
  `metadata` json DEFAULT NULL COMMENT 'Additional camera metadata',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_camera_per_exam` (`exam_id`,`camera_id`),
  KEY `idx_exam_id` (`exam_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `camera_links_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `camera_links_hls`
--

DROP TABLE IF EXISTS `camera_links_hls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `camera_links_hls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `centre_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Test centre name',
  `tc_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ch_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unique channel key (ch_no from Excel)',
  `cctv_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `camera_category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `classification` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exam_date` date DEFAULT NULL COMMENT 'Date of assessment',
  `shift_id` int DEFAULT NULL COMMENT 'FK to exam_shifts, NULL means applies to all shifts',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `status` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_exam_ch_code` (`exam_id`,`ch_code`),
  KEY `idx_exam_id` (`exam_id`),
  KEY `idx_shift_id` (`shift_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `camera_links_hls_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `camera_links_hls_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `exam_shifts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_camera_hls_shift` FOREIGN KEY (`shift_id`) REFERENCES `exam_shifts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=201 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `camera_links_rtsp`
--

DROP TABLE IF EXISTS `camera_links_rtsp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `camera_links_rtsp` (
  `id` int NOT NULL AUTO_INCREMENT,
  `device_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Unique device identifier',
  `exam_id` int NOT NULL,
  `centre_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tc_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cctv_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `classification` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_exam_id` (`exam_id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `camera_links_rtsp_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5430 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `camera_report_hls`
--

DROP TABLE IF EXISTS `camera_report_hls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `camera_report_hls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int DEFAULT NULL,
  `shift_id` int DEFAULT NULL,
  `city` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `center_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tc_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ch_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `camera_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `events` int DEFAULT '0',
  `rejected_events` int DEFAULT '0',
  `date_time` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Manual entry (dd/mm/yyyy HH:MM:SS)',
  `imageurl` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `detection_type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unique_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `pushed_to_client` tinyint(1) NOT NULL DEFAULT '0',
  `remove_from_client` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `shift_id` (`shift_id`),
  KEY `idx_camera_id` (`camera_id`),
  KEY `idx_push_status` (`pushed_to_client`,`created_at` DESC),
  KEY `idx_detection_type` (`detection_type`,`pushed_to_client`),
  KEY `idx_camera_time` (`camera_id`,`created_at` DESC),
  KEY `idx_exam_shift_push` (`exam_id`,`shift_id`,`pushed_to_client`,`created_at` DESC),
  KEY `idx_unique_id` (`unique_id`),
  KEY `idx_pushed_to_client` (`pushed_to_client`),
  KEY `idx_exam_detection_type` (`exam_id`,`detection_type`),
  KEY `idx_exam_pushed` (`exam_id`,`pushed_to_client`),
  CONSTRAINT `camera_report_hls_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `camera_report_hls_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `exam_shifts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `camera_report_rtsp`
--

DROP TABLE IF EXISTS `camera_report_rtsp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `camera_report_rtsp` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int DEFAULT NULL,
  `shift_id` int DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `center_name` varchar(255) DEFAULT NULL,
  `camera_id` varchar(255) DEFAULT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `camera_no` varchar(255) DEFAULT NULL,
  `camera_name` varchar(255) DEFAULT NULL,
  `tc_code` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `camera_status` varchar(50) DEFAULT NULL,
  `events` int DEFAULT '0',
  `date_time` varchar(100) DEFAULT NULL,
  `imageurl` text,
  `detection_type` varchar(255) DEFAULT NULL,
  `unique_id` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `pushed_to_client` tinyint(1) DEFAULT '0',
  `remove_from_client` tinyint(1) DEFAULT '0',
  `rejected_events` int DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `shift_id` (`shift_id`),
  KEY `idx_device_camera` (`device_id`,`camera_no`),
  KEY `idx_exam_shift` (`exam_id`,`shift_id`),
  KEY `idx_unique_id` (`unique_id`),
  KEY `idx_pushed_to_client` (`pushed_to_client`),
  KEY `idx_exam_detection_type` (`exam_id`,`detection_type`),
  KEY `idx_exam_pushed` (`exam_id`,`pushed_to_client`),
  CONSTRAINT `camera_report_rtsp_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `camera_report_rtsp_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `exam_shifts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exam_shifts`
--

DROP TABLE IF EXISTS `exam_shifts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `shift_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exam_shifts_exam_id` (`exam_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `exam_shifts_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exams`
--

DROP TABLE IF EXISTS `exams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exam_body` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link_type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `start_date` date DEFAULT NULL COMMENT 'Exam start date',
  `end_date` date DEFAULT NULL COMMENT 'Exam end date',
  `skip_days` json DEFAULT NULL COMMENT 'Array of day names to skip, e.g. ["Saturday","Sunday"]',
  `skip_dates` json DEFAULT NULL COMMENT 'Array of specific dates to skip, e.g. ["2026-03-15","2026-03-20"]',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exam_body` (`exam_body`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `execution_summary`
--

DROP TABLE IF EXISTS `execution_summary`;
/*!50001 DROP VIEW IF EXISTS `execution_summary`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `execution_summary` AS SELECT 
 1 AS `exam_name`,
 1 AS `task_name`,
 1 AS `total_executions`,
 1 AS `completed`,
 1 AS `failed`,
 1 AS `running`,
 1 AS `pending`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `pending_assignments`
--

DROP TABLE IF EXISTS `pending_assignments`;
/*!50001 DROP VIEW IF EXISTS `pending_assignments`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `pending_assignments` AS SELECT 
 1 AS `id`,
 1 AS `shift_id`,
 1 AS `script_id`,
 1 AS `assignment_date`,
 1 AS `start_time`,
 1 AS `end_time`,
 1 AS `script_identifier`,
 1 AS `script_name`,
 1 AS `custom_frequency_minutes`,
 1 AS `default_frequency_minutes`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `script_executions`
--

DROP TABLE IF EXISTS `script_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `script_executions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shift_id` int DEFAULT NULL COMMENT 'FK to exam_shifts.id',
  `camera_link_id` int DEFAULT NULL COMMENT 'FK to camera_links_hls or camera_links_rtsp',
  `script_id` int DEFAULT NULL COMMENT 'FK to scripts.id',
  `analytics_task_id` int DEFAULT NULL,
  `status` enum('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `scheduled_time` datetime NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `error_log` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `result_data` json DEFAULT NULL,
  `execution_metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `shift_script_assignment_id` int DEFAULT NULL COMMENT 'Reference to shift_script_assignments.id',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_scheduled_time` (`scheduled_time`),
  KEY `idx_shift_id` (`shift_id`),
  KEY `idx_script_id` (`script_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_shift_script_assignment_id` (`shift_script_assignment_id`),
  KEY `idx_exec_script_id` (`script_id`),
  CONSTRAINT `fk_exec_script` FOREIGN KEY (`script_id`) REFERENCES `scripts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_shift_script_assignment` FOREIGN KEY (`shift_script_assignment_id`) REFERENCES `shift_script_assignments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `script_executions_ibfk_1` FOREIGN KEY (`shift_id`) REFERENCES `exam_shifts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `script_executions_ibfk_2` FOREIGN KEY (`script_id`) REFERENCES `scripts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=467 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `scripts`
--

DROP TABLE IF EXISTS `scripts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `scripts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `script_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Technical identifier, e.g. face_detection',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `default_frequency_minutes` int DEFAULT '5',
  `default_duration_minutes` int DEFAULT '1',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `script_id` (`script_id`),
  KEY `idx_script_id` (`script_id`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=19625 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `shift_script_assignments`
--

DROP TABLE IF EXISTS `shift_script_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shift_script_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shift_id` int NOT NULL COMMENT 'FK to exam_shifts.id',
  `script_id` int NOT NULL COMMENT 'FK to scripts.id',
  `analytics_task_id` int DEFAULT NULL,
  `status` enum('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING' COMMENT 'Execution status of this assignment',
  `assignment_date` date NOT NULL COMMENT 'Date on which this assignment should run',
  `custom_start_time` time DEFAULT NULL,
  `custom_end_time` time DEFAULT NULL,
  `custom_frequency_minutes` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `error_log` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `result_data` json DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_shift_task_date` (`shift_id`,`script_id`,`assignment_date`),
  KEY `idx_shift_id` (`shift_id`),
  KEY `idx_script_id` (`script_id`),
  KEY `idx_status` (`status`),
  KEY `idx_assignment_date` (`assignment_date`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `fk_ssa_script` FOREIGN KEY (`script_id`) REFERENCES `scripts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `shift_script_assignments_ibfk_1` FOREIGN KEY (`shift_id`) REFERENCES `exam_shifts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `shift_script_assignments_ibfk_2` FOREIGN KEY (`script_id`) REFERENCES `scripts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=229 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Contact phone number',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Company or organization name',
  `verified` tinyint(1) DEFAULT '0' COMMENT 'Account verification status',
  `verified_date` datetime DEFAULT NULL COMMENT 'Date and time when account was verified',
  `role` enum('ADMIN','OPERATOR','VIEWER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'VIEWER',
  `is_active` tinyint(1) DEFAULT '1',
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_username` (`username`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_verified` (`verified`),
  KEY `idx_company_name` (`company_name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Final view structure for view `execution_summary`
--

/*!50001 DROP VIEW IF EXISTS `execution_summary`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `execution_summary` AS select `e`.`exam_name` AS `exam_name`,`at`.`task_name` AS `task_name`,count(0) AS `total_executions`,sum((case when (`se`.`status` = 'COMPLETED') then 1 else 0 end)) AS `completed`,sum((case when (`se`.`status` = 'FAILED') then 1 else 0 end)) AS `failed`,sum((case when (`se`.`status` = 'RUNNING') then 1 else 0 end)) AS `running`,sum((case when (`se`.`status` = 'PENDING') then 1 else 0 end)) AS `pending` from ((`script_executions` `se` join `analytics_tasks` `at` on((`se`.`analytics_task_id` = `at`.`id`))) join `exams` `e` on((`at`.`exam_id` = `e`.`id`))) group by `e`.`exam_name`,`at`.`task_name` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `pending_assignments`
--

/*!50001 DROP VIEW IF EXISTS `pending_assignments`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `pending_assignments` AS select `ssa`.`id` AS `id`,`ssa`.`shift_id` AS `shift_id`,`ssa`.`script_id` AS `script_id`,`ssa`.`assignment_date` AS `assignment_date`,`es`.`start_time` AS `start_time`,`es`.`end_time` AS `end_time`,`s`.`script_id` AS `script_identifier`,`s`.`name` AS `script_name`,`ssa`.`custom_frequency_minutes` AS `custom_frequency_minutes`,`s`.`default_frequency_minutes` AS `default_frequency_minutes` from ((`shift_script_assignments` `ssa` join `exam_shifts` `es` on((`ssa`.`shift_id` = `es`.`id`))) join `scripts` `s` on((`ssa`.`script_id` = `s`.`id`))) where ((`ssa`.`status` = 'PENDING') and (`ssa`.`assignment_date` = curdate()) and (`ssa`.`is_active` = true)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-26 10:37:36
