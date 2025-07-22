-- phpMyAdmin SQL Dump
-- version 5.1.1
-- https://www.phpmyadmin.net/
--
-- Host: 10.129.76.12
-- Tempo de geração: 21/07/2025 às 23:38
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
(959, 'Partida Automática 1753141062267', 'Partida criada automaticamente - MMR: Team1(1482) vs Team2(1158)', '[\"Bot8\",\"Bot7\",\"Bot4\",\"Bot9\",\"Bot5\"]', '[\"Bot1\",\"Bot3\",\"Bot6\",\"Bot2\",\"popcorn seller#coup\"]', NULL, 'draft', 'Sistema', '2025-07-21 23:37:42', NULL, 'Ranked 5v5', NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, '2025-07-21 23:38:20', '{\"team1\":[{\"summonerName\":\"Bot8\",\"assignedLane\":\"top\",\"teamIndex\":0,\"mmr\":1200,\"primaryLane\":\"top\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot7\",\"assignedLane\":\"jungle\",\"teamIndex\":1,\"mmr\":1200,\"primaryLane\":\"jungle\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot4\",\"assignedLane\":\"mid\",\"teamIndex\":2,\"mmr\":1200,\"primaryLane\":\"mid\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot9\",\"assignedLane\":\"adc\",\"teamIndex\":3,\"mmr\":1200,\"primaryLane\":\"adc\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot5\",\"assignedLane\":\"support\",\"teamIndex\":4,\"mmr\":1200,\"primaryLane\":\"support\",\"secondaryLane\":\"fill\",\"isAutofill\":false}],\"team2\":[{\"summonerName\":\"Bot1\",\"assignedLane\":\"top\",\"teamIndex\":5,\"mmr\":1200,\"primaryLane\":\"top\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot3\",\"assignedLane\":\"jungle\",\"teamIndex\":6,\"mmr\":1200,\"primaryLane\":\"jungle\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot6\",\"assignedLane\":\"mid\",\"teamIndex\":7,\"mmr\":1200,\"primaryLane\":\"mid\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"Bot2\",\"assignedLane\":\"adc\",\"teamIndex\":8,\"mmr\":1200,\"primaryLane\":\"adc\",\"secondaryLane\":\"fill\",\"isAutofill\":false},{\"summonerName\":\"popcorn seller#coup\",\"assignedLane\":\"support\",\"teamIndex\":9,\"mmr\":1200,\"primaryLane\":\"support\",\"secondaryLane\":\"fill\",\"isAutofill\":false}],\"currentAction\":6,\"phase\":\"bans\",\"phases\":[{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":0},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":0},{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":1},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":1},{\"phase\":\"bans\",\"team\":1,\"action\":\"ban\",\"playerIndex\":2},{\"phase\":\"bans\",\"team\":2,\"action\":\"ban\",\"playerIndex\":2},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":0},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":0},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":1},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":1},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":2},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":2},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":3},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":3},{\"phase\":\"picks\",\"team\":1,\"action\":\"pick\",\"playerIndex\":4},{\"phase\":\"picks\",\"team\":2,\"action\":\"pick\",\"playerIndex\":4}],\"actions\":[{\"teamIndex\":1,\"playerIndex\":0,\"playerName\":\"Bot8\",\"playerLane\":\"top\",\"championId\":107,\"action\":\"ban\",\"actionIndex\":0,\"timestamp\":\"2025-07-21T23:37:54.515Z\"},{\"teamIndex\":2,\"playerIndex\":0,\"playerName\":\"Bot1\",\"playerLane\":\"top\",\"championId\":134,\"action\":\"ban\",\"actionIndex\":1,\"timestamp\":\"2025-07-21T23:37:59.682Z\"},{\"teamIndex\":1,\"playerIndex\":1,\"playerName\":\"Bot7\",\"playerLane\":\"jungle\",\"championId\":80,\"action\":\"ban\",\"actionIndex\":2,\"timestamp\":\"2025-07-21T23:38:04.855Z\"},{\"teamIndex\":2,\"playerIndex\":1,\"playerName\":\"Bot3\",\"playerLane\":\"jungle\",\"championId\":64,\"action\":\"ban\",\"actionIndex\":3,\"timestamp\":\"2025-07-21T23:38:10.014Z\"},{\"teamIndex\":1,\"playerIndex\":2,\"playerName\":\"Bot4\",\"playerLane\":\"mid\",\"championId\":75,\"action\":\"ban\",\"actionIndex\":4,\"timestamp\":\"2025-07-21T23:38:15.169Z\"},{\"teamIndex\":2,\"playerIndex\":2,\"playerName\":\"Bot6\",\"playerLane\":\"mid\",\"championId\":3,\"action\":\"ban\",\"actionIndex\":5,\"timestamp\":\"2025-07-21T23:38:20.342Z\"}],\"team1Picks\":[],\"team1Bans\":[{\"teamIndex\":1,\"playerIndex\":0,\"playerName\":\"Bot8\",\"playerLane\":\"top\",\"championId\":107,\"action\":\"ban\",\"actionIndex\":0,\"timestamp\":\"2025-07-21T23:37:54.515Z\"},{\"teamIndex\":1,\"playerIndex\":1,\"playerName\":\"Bot7\",\"playerLane\":\"jungle\",\"championId\":80,\"action\":\"ban\",\"actionIndex\":2,\"timestamp\":\"2025-07-21T23:38:04.855Z\"},{\"teamIndex\":1,\"playerIndex\":2,\"playerName\":\"Bot4\",\"playerLane\":\"mid\",\"championId\":75,\"action\":\"ban\",\"actionIndex\":4,\"timestamp\":\"2025-07-21T23:38:15.169Z\"}],\"team2Picks\":[],\"team2Bans\":[{\"teamIndex\":2,\"playerIndex\":0,\"playerName\":\"Bot1\",\"playerLane\":\"top\",\"championId\":134,\"action\":\"ban\",\"actionIndex\":1,\"timestamp\":\"2025-07-21T23:37:59.682Z\"},{\"teamIndex\":2,\"playerIndex\":1,\"playerName\":\"Bot3\",\"playerLane\":\"jungle\",\"championId\":64,\"action\":\"ban\",\"actionIndex\":3,\"timestamp\":\"2025-07-21T23:38:10.014Z\"},{\"teamIndex\":2,\"playerIndex\":2,\"playerName\":\"Bot6\",\"playerLane\":\"mid\",\"championId\":3,\"action\":\"ban\",\"actionIndex\":5,\"timestamp\":\"2025-07-21T23:38:20.342Z\"}]}', '{\"team1Players\":[\"Bot8\",\"Bot7\",\"Bot4\",\"Bot9\",\"Bot5\"],\"team2Players\":[\"Bot1\",\"Bot3\",\"Bot6\",\"Bot2\",\"popcorn seller#coup\"],\"averageMMR\":{\"team1\":1482.2,\"team2\":1158},\"lanes\":{\"team1\":[{\"player\":\"Bot8\",\"lane\":\"top\",\"teamIndex\":0,\"mmr\":1813,\"isAutofill\":false},{\"player\":\"Bot7\",\"lane\":\"jungle\",\"teamIndex\":1,\"mmr\":1412,\"isAutofill\":true},{\"player\":\"Bot4\",\"lane\":\"mid\",\"teamIndex\":2,\"mmr\":1899,\"isAutofill\":false},{\"player\":\"Bot9\",\"lane\":\"bot\",\"teamIndex\":3,\"mmr\":1296,\"isAutofill\":true},{\"player\":\"Bot5\",\"lane\":\"support\",\"teamIndex\":4,\"mmr\":991,\"isAutofill\":false}],\"team2\":[{\"player\":\"Bot1\",\"lane\":\"top\",\"teamIndex\":5,\"mmr\":1663,\"isAutofill\":false},{\"player\":\"Bot3\",\"lane\":\"jungle\",\"teamIndex\":6,\"mmr\":1328,\"isAutofill\":false},{\"player\":\"Bot6\",\"lane\":\"mid\",\"teamIndex\":7,\"mmr\":1498,\"isAutofill\":false},{\"player\":\"Bot2\",\"lane\":\"bot\",\"teamIndex\":8,\"mmr\":1293,\"isAutofill\":false},{\"player\":\"popcorn seller#coup\",\"lane\":\"support\",\"teamIndex\":9,\"mmr\":8,\"isAutofill\":true}]}}', NULL, NULL, NULL, NULL, NULL, NULL, 'Sistema', 0);

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=960;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
