-- phpMyAdmin SQL Dump
-- version 5.1.1
-- https://www.phpmyadmin.net/
--
-- Host: 10.129.76.12
-- Tempo de geração: 25/07/2025 às 01:18
-- Versão do servidor: 5.6.26-log
-- Versão do PHP: 8.0.15

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `lolmatchmaking`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `custom_matches`
--

CREATE TABLE `custom_matches` (
  `id` int(11) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text,
  `team1_players` text NOT NULL,
  `team2_players` text NOT NULL,
  `winner_team` int(11) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `created_by` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `game_mode` varchar(20) DEFAULT '5v5',
  `duration` int(11) DEFAULT NULL,
  `lp_changes` text,
  `average_mmr_team1` int(11) DEFAULT NULL,
  `average_mmr_team2` int(11) DEFAULT NULL,
  `participants_data` text,
  `riot_game_id` varchar(255) DEFAULT NULL,
  `detected_by_lcu` tinyint(4) DEFAULT '0',
  `notes` text,
  `custom_lp` int(11) DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT NULL,
  `pick_ban_data` text,
  `draft_data` text,
  `game_data` text,
  `linked_results` text,
  `actual_winner` int(11) DEFAULT NULL,
  `actual_duration` int(11) DEFAULT NULL,
  `riot_id` varchar(255) DEFAULT NULL,
  `mmr_changes` text,
  `match_leader` varchar(255) DEFAULT NULL COMMENT 'Riot ID do líder da partida',
  `draft_current_action` int(11) DEFAULT '0' COMMENT 'Ação atual do draft (0-19)'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Despejando dados para a tabela `custom_matches`
--

INSERT INTO `custom_matches` (`id`, `title`, `description`, `team1_players`, `team2_players`, `winner_team`, `status`, `created_by`, `created_at`, `completed_at`, `game_mode`, `duration`, `lp_changes`, `average_mmr_team1`, `average_mmr_team2`, `participants_data`, `riot_game_id`, `detected_by_lcu`, `notes`, `custom_lp`, `updated_at`, `pick_ban_data`, `draft_data`, `game_data`, `linked_results`, `actual_winner`, `actual_duration`, `riot_id`, `mmr_changes`, `match_leader`, `draft_current_action`) VALUES
(1031, 'Partida Automática 1753406173692', 'Partida criada automaticamente - MMR: Team1(1433) vs Team2(1029)', '[\"Bot18\",\"Bot11\",\"Bot15\",\"Bot10\",\"Bot16\"]', '[\"Bot12\",\"Bot14\",\"popcorn seller#coup\",\"Bot17\",\"Bot13\"]', NULL, 'draft', 'Sistema', '2025-07-25 01:16:14', NULL, 'Ranked 5v5', NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, '2025-07-25 01:16:45', '{\"team1\":[{\"summonerName\":\"Bot18\",\"assignedLane\":\"top\",\"teamIndex\":0,\"mmr\":1200,\"primaryLane\":\"top\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot11\",\"assignedLane\":\"jungle\",\"teamIndex\":1,\"mmr\":1200,\"primaryLane\":\"jungle\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot15\",\"assignedLane\":\"mid\",\"teamIndex\":2,\"mmr\":1200,\"primaryLane\":\"mid\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot10\",\"assignedLane\":\"adc\",\"teamIndex\":3,\"mmr\":1200,\"primaryLane\":\"adc\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot16\",\"assignedLane\":\"support\",\"teamIndex\":4,\"mmr\":1200,\"primaryLane\":\"support\",\"secondaryLane\":\"fill\",\"isAutofill\":false}],\"team2\":[{\"summonerName\":\"Bot12\",\"assignedLane\":\"top\",\"teamIndex\":5,\"mmr\":1200,\"primaryLane\":\"top\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot14\",\"assignedLane\":\"jungle\",\"teamIndex\":6,\"mmr\":1200,\"primaryLane\":\"jungle\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"popcorn seller#coup\",\"assignedLane\":\"mid\",\"teamIndex\":7,\"mmr\":1200,\"primaryLane\":\"mid\",\"secondaryLane\":\"fill\",\"isAutofill\":false,\"puuid\":\"9e7d05fe-ef7f-5ecb-b877-de7e68ff06eb\"},{\"summonerName\":\"Bot17\",\"assignedLane\":\"adc\",\"teamIndex\":8,\"mmr\":1200,\"primaryLane\":\"adc\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot13\",\"assignedLane\":\"support\",\"teamIndex\":9,\"mmr\":1200,\"primaryLane\":\"support\",\"secondaryLane\":\"fill\",\"isAutofill\":false}],\"currentAction\":5,\"phase\":\"bans\",\"phases\":[{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":0,\"actionIndex\":0,\"playerId\":\"Bot18\",\"playerName\":\"Bot18\"},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":0,\"actionIndex\":1,\"playerId\":\"Bot12\",\"playerName\":\"Bot12\"},{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":1,\"actionIndex\":2,\"playerId\":\"Bot11\",\"playerName\":\"Bot11\"},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":1,\"actionIndex\":3,\"playerId\":\"Bot14\",\"playerName\":\"Bot14\"},{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":2,\"actionIndex\":4,\"playerId\":\"Bot15\",\"playerName\":\"Bot15\"},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":2,\"actionIndex\":5,\"playerId\":\"9e7d05fe-ef7f-5ecb-b877-de7e68ff06eb\",\"playerName\":\"popcorn seller#coup\"},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":0,\"actionIndex\":6,\"playerId\":\"Bot18\",\"playerName\":\"Bot18\"},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":0,\"actionIndex\":7,\"playerId\":\"Bot12\",\"playerName\":\"Bot12\"},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":1,\"actionIndex\":8,\"playerId\":\"Bot14\",\"playerName\":\"Bot14\"},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":1,\"actionIndex\":9,\"playerId\":\"Bot11\",\"playerName\":\"Bot11\"},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":2,\"actionIndex\":10,\"playerId\":\"Bot15\",\"playerName\":\"Bot15\"},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":2,\"actionIndex\":11,\"playerId\":\"9e7d05fe-ef7f-5ecb-b877-de7e68ff06eb\",\"playerName\":\"popcorn seller#coup\"},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":3,\"actionIndex\":12,\"playerId\":\"Bot17\",\"playerName\":\"Bot17\"},{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":3,\"actionIndex\":13,\"playerId\":\"Bot10\",\"playerName\":\"Bot10\"},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":4,\"actionIndex\":14,\"playerId\":\"Bot13\",\"playerName\":\"Bot13\"},{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":4,\"actionIndex\":15,\"playerId\":\"Bot16\",\"playerName\":\"Bot16\"},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":3,\"actionIndex\":16,\"playerId\":\"Bot17\",\"playerName\":\"Bot17\"},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":3,\"actionIndex\":17,\"playerId\":\"Bot10\",\"playerName\":\"Bot10\"},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":4,\"actionIndex\":18,\"playerId\":\"Bot16\",\"playerName\":\"Bot16\"},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":4,\"actionIndex\":19,\"playerId\":\"Bot13\",\"playerName\":\"Bot13\"}],\"actions\":[{\"teamIndex\":1,\"playerIndex\":0,\"playerName\":\"Bot18\",\"playerLane\":\"top\",\"championId\":17,\"action\":\"ban\",\"actionIndex\":0,\"timestamp\":\"2025-07-25T01:16:25.601Z\"},{\"teamIndex\":2,\"playerIndex\":0,\"playerName\":\"Bot12\",\"playerLane\":\"top\",\"championId\":117,\"action\":\"ban\",\"actionIndex\":1,\"timestamp\":\"2025-07-25T01:16:29.348Z\"},{\"teamIndex\":1,\"playerIndex\":1,\"playerName\":\"Bot11\",\"playerLane\":\"jungle\",\"championId\":152,\"action\":\"ban\",\"actionIndex\":2,\"timestamp\":\"2025-07-25T01:16:33.874Z\"},{\"teamIndex\":2,\"playerIndex\":1,\"playerName\":\"Bot14\",\"playerLane\":\"jungle\",\"championId\":122,\"action\":\"ban\",\"actionIndex\":3,\"timestamp\":\"2025-07-25T01:16:38.081Z\"},{\"teamIndex\":1,\"playerIndex\":2,\"playerName\":\"Bot15\",\"playerLane\":\"mid\",\"championId\":25,\"action\":\"ban\",\"actionIndex\":4,\"timestamp\":\"2025-07-25T01:16:43.931Z\"}],\"team1Picks\":[],\"team1Bans\":[{\"teamIndex\":1,\"playerIndex\":0,\"playerName\":\"Bot18\",\"playerLane\":\"top\",\"championId\":17,\"action\":\"ban\",\"actionIndex\":0,\"timestamp\":\"2025-07-25T01:16:25.601Z\"},{\"teamIndex\":1,\"playerIndex\":1,\"playerName\":\"Bot11\",\"playerLane\":\"jungle\",\"championId\":152,\"action\":\"ban\",\"actionIndex\":2,\"timestamp\":\"2025-07-25T01:16:33.874Z\"},{\"teamIndex\":1,\"playerIndex\":2,\"playerName\":\"Bot15\",\"playerLane\":\"mid\",\"championId\":25,\"action\":\"ban\",\"actionIndex\":4,\"timestamp\":\"2025-07-25T01:16:43.931Z\"}],\"team2Picks\":[],\"team2Bans\":[{\"teamIndex\":2,\"playerIndex\":0,\"playerName\":\"Bot12\",\"playerLane\":\"top\",\"championId\":117,\"action\":\"ban\",\"actionIndex\":1,\"timestamp\":\"2025-07-25T01:16:29.348Z\"},{\"teamIndex\":2,\"playerIndex\":1,\"playerName\":\"Bot14\",\"playerLane\":\"jungle\",\"championId\":122,\"action\":\"ban\",\"actionIndex\":3,\"timestamp\":\"2025-07-25T01:16:38.081Z\"}]}', '{\"team1Players\":[\"Bot18\",\"Bot11\",\"Bot15\",\"Bot10\",\"Bot16\"],\"team2Players\":[\"Bot12\",\"Bot14\",\"popcorn seller#coup\",\"Bot17\",\"Bot13\"],\"averageMMR\":{\"team1\":1433.2,\"team2\":1028.8},\"lanes\":{\"team1\":[{\"player\":\"Bot18\",\"lane\":\"top\",\"teamIndex\":0,\"mmr\":1153,\"isAutofill\":false},{\"player\":\"Bot11\",\"lane\":\"jungle\",\"teamIndex\":1,\"mmr\":1091,\"isAutofill\":false},{\"player\":\"Bot15\",\"lane\":\"mid\",\"teamIndex\":2,\"mmr\":1720,\"isAutofill\":false},{\"player\":\"Bot10\",\"lane\":\"bot\",\"teamIndex\":3,\"mmr\":1509,\"isAutofill\":false},{\"player\":\"Bot16\",\"lane\":\"support\",\"teamIndex\":4,\"mmr\":1693,\"isAutofill\":false}],\"team2\":[{\"player\":\"Bot12\",\"lane\":\"top\",\"teamIndex\":5,\"mmr\":1121,\"isAutofill\":false},{\"player\":\"Bot14\",\"lane\":\"jungle\",\"teamIndex\":6,\"mmr\":1086,\"isAutofill\":true},{\"player\":\"popcorn seller#coup\",\"lane\":\"mid\",\"teamIndex\":7,\"mmr\":8,\"isAutofill\":true},{\"player\":\"Bot17\",\"lane\":\"bot\",\"teamIndex\":8,\"mmr\":1349,\"isAutofill\":false},{\"player\":\"Bot13\",\"lane\":\"support\",\"teamIndex\":9,\"mmr\":1580,\"isAutofill\":false}]}}', NULL, NULL, NULL, NULL, NULL, NULL, 'Sistema', 0);

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `custom_matches`
--
ALTER TABLE `custom_matches`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `custom_matches`
--
ALTER TABLE `custom_matches`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1032;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
