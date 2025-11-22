const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PLUGIN_HTTP_HOST = process.env.PLUGIN_HTTP_HOST || '127.0.0.1';
const PLUGIN_HTTP_PORT = parseInt(process.env.PLUGIN_HTTP_PORT || '8080', 10);
const PLUGIN_HTTP_AUTH_TOKEN = process.env.PLUGIN_HTTP_AUTH_TOKEN || ''; // Optional: Set if RequireAuthToken is enabled in plugin config

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
let dbPool = null;

function getDbPool() {
	if (!dbPool) {
		const config = {
			host: process.env.DB_HOST || 'localhost',
			port: parseInt(process.env.DB_PORT) || 3306,
			user: process.env.DB_USER || 'root',
			password: process.env.DB_PASSWORD || '',
			database: process.env.DB_NAME || 'unturned',
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0,
			// Handle big numbers (SteamID) as strings to prevent precision loss
			supportBigNumbers: true,
			bigNumberStrings: true
		};
		dbPool = mysql.createPool(config);
	}
	return dbPool;
}

const tablePrefix = process.env.TABLE_PREFIX || 'kawe_';

async function callPluginApi(path, payload = {}) {
	return new Promise((resolve, reject) => {
		try {
			const postData = JSON.stringify(payload ?? {});
			const headers = {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(postData)
			};
			
			// Add authentication token if configured
			if (PLUGIN_HTTP_AUTH_TOKEN) {
				headers['X-Auth-Token'] = PLUGIN_HTTP_AUTH_TOKEN;
			}
			
			const options = {
				hostname: PLUGIN_HTTP_HOST,
				port: PLUGIN_HTTP_PORT,
				path,
				method: 'POST',
				headers: headers,
				timeout: 10000
			};

			const req = http.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => { data += chunk; });
				res.on('end', () => {
					let parsed = null;
					if (data) {
						try {
							parsed = JSON.parse(data);
						} catch (err) {
							console.warn('[PluginAPI] Failed to parse JSON response:', err.message);
						}
					}
					resolve({ statusCode: res.statusCode, data: parsed });
				});
			});

			req.on('error', (err) => {
				// Instead of rejecting, resolve with error info so caller can handle fallback
				console.error(`[PluginAPI] Request error for ${path}:`, err.message);
				console.error(`[PluginAPI] Connection details: http://${PLUGIN_HTTP_HOST}:${PLUGIN_HTTP_PORT}${path}`);
				console.error(`[PluginAPI] Error code: ${err.code}, syscall: ${err.syscall}`);
				resolve({ 
					statusCode: 500, 
					data: { 
						success: false, 
						error: 'plugin_api_unavailable', 
						message: err.message,
						code: err.code,
						syscall: err.syscall
					} 
				});
			});
			
			req.on('timeout', () => {
				req.destroy();
				// Instead of rejecting, resolve with timeout info
				console.warn(`[PluginAPI] Request timeout for ${path}`);
				resolve({ 
					statusCode: 504, 
					data: { 
						success: false, 
						error: 'plugin_api_timeout', 
						message: 'Plugin API request timed out' 
					} 
				});
			});

			req.write(postData);
			req.end();
		} catch (error) {
			// Instead of rejecting, resolve with error info
			console.warn(`[PluginAPI] Exception for ${path}:`, error.message);
			resolve({ 
				statusCode: 500, 
				data: { 
					success: false, 
					error: 'plugin_api_error', 
					message: error.message 
				} 
			});
		}
	});
}

function extractAuthCode(req) {
	return (req.body && req.body.code) ||
		(req.query && req.query.code) ||
		req.headers['x-auth-code'] ||
		null;
}

async function fetchPlayerNamesMap(steamIds = []) {
	const uniqueIds = Array.from(new Set((steamIds || []).filter(id => id && id !== '0')));
	const map = {};
	if (uniqueIds.length === 0) return map;

	try {
		const pool = getDbPool();
		const placeholders = uniqueIds.map(() => '?').join(',');
		const [rows] = await pool.query(`
			SELECT CAST(SteamId AS CHAR) as SteamId, Name 
			FROM PlayerStatsNew 
			WHERE SteamId IN (${placeholders})
		`, uniqueIds);

		rows.forEach(row => {
			map[row.SteamId] = row.Name || row.SteamId;
		});
	} catch (error) {
		console.warn('[Players] Failed to load names for faction data:', error.message);
	}

	return map;
}

async function attachNamesToFactionData(payload) {
	if (!payload) return payload;

	const ids = new Set();
	(payload.members || []).forEach(member => {
		if (member?.steamId) ids.add(member.steamId);
	});
	(payload.invitations || []).forEach(inv => {
		if (inv?.steamId) ids.add(inv.steamId);
		if (inv?.inviterId) ids.add(inv.inviterId);
	});
	(payload.join_requests || []).forEach(req => {
		if (req?.steamId) ids.add(req.steamId);
	});

	const nameMap = await fetchPlayerNamesMap(Array.from(ids));

	(payload.members || []).forEach(member => {
		if (member?.steamId && nameMap[member.steamId]) {
			member.playerName = nameMap[member.steamId];
		}
	});

	(payload.invitations || []).forEach(inv => {
		if (inv?.steamId && nameMap[inv.steamId]) {
			inv.playerName = nameMap[inv.steamId];
		}
		if (inv?.inviterId && nameMap[inv.inviterId]) {
			inv.inviterName = nameMap[inv.inviterId];
		}
	});

	(payload.join_requests || []).forEach(req => {
		if (req?.steamId && nameMap[req.steamId]) {
			req.playerName = nameMap[req.steamId];
		}
	});

	return payload;
}

const FACTION_ROLE = {
	NONE: -1,
	MEMBER: 0,
	OFFICER: 1,
	VICE_LEADER: 2,
	LEADER: 3
};

function getRoleNameFromLevel(level) {
	switch (level) {
		case FACTION_ROLE.LEADER: return 'Leader';
		case FACTION_ROLE.VICE_LEADER: return 'Vice Leader';
		case FACTION_ROLE.OFFICER: return 'Officer';
		default: return 'Member';
	}
}

function getRoleDisplayFromLevel(level, aliases) {
	if (aliases) {
		const alias = aliases[String(level)] || aliases[level];
		if (alias && alias.trim()) {
			return alias.trim();
		}
	}
	return getRoleNameFromLevel(level);
}

function buildFactionPermissions(roleLevel) {
	if (roleLevel == null || roleLevel < FACTION_ROLE.MEMBER) {
		return {
			canInvite: false,
			canAcceptRequests: false,
			canManageQuests: false,
			canPromoteOfficer: false,
			canPromoteViceLeader: false,
			canTransferLeadership: false,
			canSetAliases: false,
			canSetIcon: false
		};
	}

	return {
		canInvite: roleLevel >= FACTION_ROLE.OFFICER,
		canAcceptRequests: roleLevel >= FACTION_ROLE.OFFICER,
		canManageQuests: roleLevel >= FACTION_ROLE.VICE_LEADER,
		canPromoteOfficer: roleLevel >= FACTION_ROLE.VICE_LEADER,
		canPromoteViceLeader: roleLevel === FACTION_ROLE.LEADER,
		canTransferLeadership: roleLevel === FACTION_ROLE.LEADER,
		canSetAliases: roleLevel === FACTION_ROLE.LEADER,
		canSetIcon: roleLevel === FACTION_ROLE.LEADER
	};
}

function normalizeSteamId(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
	return value.toString();
}

async function getSteamIdFromAuthCode(authCode) {
	if (!authCode) return null;
	const pool = getDbPool();
	const prefix = tablePrefix;
	const [rows] = await pool.query(`
		SELECT CAST(steam_id AS CHAR) AS steam_id
		FROM ${prefix}player_auth
		WHERE UPPER(auth_code) = UPPER(?)
		LIMIT 1
	`, [authCode.trim()]);
	return rows.length > 0 ? rows[0].steam_id : null;
}

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', async (req, res) => {
	try {
		const pool = getDbPool();
		await pool.query('SELECT 1');
		res.json({ status: 'ok', database: 'connected' });
	} catch (error) {
		res.status(500).json({ status: 'error', message: error.message });
	}
});

// Get dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;

		const [factions] = await pool.query(`SELECT COUNT(*) as count FROM ${prefix}factions`);
		const [quests] = await pool.query(`SELECT COUNT(*) as count FROM ${prefix}quest_definitions WHERE enabled = 1`);
		const [players] = await pool.query(`SELECT COUNT(DISTINCT player_id) as count FROM ${prefix}quest_progress`);
		const [activeQuests] = await pool.query(`SELECT COUNT(*) as count FROM ${prefix}quest_progress WHERE is_active = 1`);

		res.json({
			totalFactions: factions[0].count,
			totalQuests: quests[0].count,
			totalPlayers: players[0].count,
			activeQuests: activeQuests[0].count
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get commands (filtered for non-admin/non-debug)
app.get('/api/commands', (req, res) => {
	try {
		const commandsPath = path.join(__dirname, 'commands.json');
		const commandsData = JSON.parse(fs.readFileSync(commandsPath, 'utf8'));
		
		// Filter out admin and debug commands
		const filteredCommands = commandsData.commands.filter(cmd => {
			// Check if command is admin or debug
			if (cmd.isAdmin === true || cmd.isDebug === true) {
				return false;
			}
			
			// Check permissions for admin/debug keywords
			if (cmd.permissions && cmd.permissions.some(p => 
				p.toLowerCase().includes('admin') || 
				p.toLowerCase().includes('debug') ||
				p.toLowerCase().includes('reload')
			)) {
				return false;
			}
			
			// Check command name for admin/debug keywords
			if (cmd.name && (
				cmd.name.toLowerCase().includes('admin') ||
				cmd.name.toLowerCase().includes('debug') ||
				cmd.name.toLowerCase().includes('reload')
			)) {
				return false;
			}
			
			return true;
		});
		
		// Group by category
		const groupedCommands = {};
		filteredCommands.forEach(cmd => {
			const category = cmd.category || 'Other';
			if (!groupedCommands[category]) {
				groupedCommands[category] = [];
			}
			groupedCommands[category].push(cmd);
		});
		
		res.json({
			commands: filteredCommands,
			grouped: groupedCommands,
			total: filteredCommands.length
		});
	} catch (error) {
		console.error('Error loading commands:', error);
		res.status(500).json({ error: error.message });
	}
});

// ==================== FACTIONS ====================

// Get all factions
app.get('/api/factions', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;

		const [factions] = await pool.query(`
			SELECT f.id, f.name, f.tag, f.color, f.icon_url, CAST(f.leader_id AS CHAR) as leader_id,
				COALESCE(fs.faction_points, 0) as faction_points, 
				COALESCE(fs.faction_xp, 0) as faction_xp, 
				COALESCE(fs.tier, 1) as tier,
				(SELECT COUNT(*) FROM ${prefix}faction_members WHERE faction_id = f.id) as member_count
			FROM ${prefix}factions f
			LEFT JOIN ${prefix}faction_states fs ON f.id = fs.faction_id
			ORDER BY f.id ASC
		`);

		res.json(factions);
	} catch (error) {
		console.error('Error loading factions:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get faction details
app.get('/api/factions/:id', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const factionId = req.params.id;

		const [factions] = await pool.query(`
			SELECT f.id, f.name, f.tag, f.color, f.icon_url, CAST(f.leader_id AS CHAR) as leader_id,
				COALESCE(fs.faction_points, 0) as faction_points, 
				COALESCE(fs.faction_xp, 0) as faction_xp, 
				COALESCE(fs.tier, 1) as tier
			FROM ${prefix}factions f
			LEFT JOIN ${prefix}faction_states fs ON f.id = fs.faction_id
			WHERE f.id = ?
		`, [factionId]);

		if (factions.length === 0) {
			return res.status(404).json({ error: 'Faction not found' });
		}

		const [members] = await pool.query(`
			SELECT faction_id, player_id, joined_at 
			FROM ${prefix}faction_members WHERE faction_id = ? ORDER BY joined_at DESC
		`, [factionId]);

		const [invitations] = await pool.query(`
			SELECT faction_id, invited_player_id, 
				inviter_id, created_at, expires_at
			FROM ${prefix}faction_invitations WHERE faction_id = ? AND expires_at > NOW() ORDER BY created_at DESC
		`, [factionId]);

		// Get completed quest count per tier
		const [completedQuestsByTier] = await pool.query(`
			SELECT COALESCE(qd.tier, 1) as tier, COUNT(*) as completed_count
			FROM ${prefix}faction_quests fq
			LEFT JOIN ${prefix}quest_definitions qd ON fq.quest_id = qd.id
			WHERE fq.faction_id = ? AND fq.is_completed = 1
			GROUP BY COALESCE(qd.tier, 1)
			ORDER BY tier ASC
		`, [factionId]);

		// Get total quests attempted
		const [totalQuests] = await pool.query(`
			SELECT COUNT(*) as total_count
			FROM ${prefix}faction_quests
			WHERE faction_id = ?
		`, [factionId]);

		// Convert completed quests by tier to object
		const completedByTier = {};
		completedQuestsByTier.forEach(row => {
			completedByTier[row.tier] = row.completed_count;
		});

		res.json({
			...factions[0],
			members,
			invitations,
			completed_quests_by_tier: completedByTier,
			total_quests: totalQuests[0]?.total_count || 0
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ==================== QUESTS ====================

// Get next quest ID (auto-generate format: QMG-001, QMG-002, etc.)
app.get('/api/quests/next-id', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;

		const [result] = await pool.query(`
			SELECT id FROM ${prefix}quest_definitions 
			WHERE id LIKE 'QMG-%' 
			ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) DESC 
			LIMIT 1
		`);

		let nextNumber = 1;
		if (result.length > 0) {
			const lastId = result[0].id;
			const lastNumber = parseInt(lastId.substring(4)) || 0;
			nextNumber = lastNumber + 1;
		}

		const nextId = `QMG-${String(nextNumber).padStart(3, '0')}`;
		res.json({ nextId });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get all quests
app.get('/api/quests', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;

		const [quests] = await pool.query(`
			SELECT * FROM ${prefix}quest_definitions ORDER BY id
		`);

		// Parse JSON fields
		const parsedQuests = quests.map(q => {
			// Normalize quest_type: handle null, undefined, empty string, or whitespace
			let questType = (q.quest_type || '').toString().trim().toLowerCase();
			if (!questType || questType === '') {
				questType = 'repeat'; // Default to repeat if empty/null
			}
			
			return {
				...q,
				quest_type: questType,
				tags: q.tags ? q.tags.split(',').filter(t => t.trim()) : [],
				objectives: q.objectives ? JSON.parse(q.objectives) : [],
				rewards: q.rewards ? JSON.parse(q.rewards) : []
			};
		});

		res.json(parsedQuests);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get quest details
app.get('/api/quests/:id', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const questId = req.params.id;

		const [quests] = await pool.query(`
			SELECT * FROM ${prefix}quest_definitions WHERE id = ?
		`, [questId]);

		if (quests.length === 0) {
			return res.status(404).json({ error: 'Quest not found' });
		}

		const quest = quests[0];
		// Normalize quest_type: handle null, undefined, empty string, or whitespace
		let questType = (quest.quest_type || '').toString().trim().toLowerCase();
		if (!questType || questType === '') {
			questType = 'repeat'; // Default to repeat if empty/null
		}
		quest.quest_type = questType;
		quest.tags = quest.tags ? quest.tags.split(',').filter(t => t.trim()) : [];
		quest.objectives = quest.objectives ? JSON.parse(quest.objectives) : [];
		quest.rewards = quest.rewards ? JSON.parse(quest.rewards) : [];

		// Get player progress
		const [progress] = await pool.query(`
			SELECT player_id, is_active, is_ready_to_complete, objective_progress, started_at, last_completed_at
			FROM ${prefix}quest_progress WHERE quest_id = ?
		`, [questId]);

		const parsedProgress = progress.map(p => ({
			...p,
			objective_progress: p.objective_progress ? JSON.parse(p.objective_progress) : []
		}));

		res.json({
			...quest,
			progress: parsedProgress
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Create/Update quest
app.post('/api/quests', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const quest = req.body;

		const questData = {
			id: quest.id,
			display_name: quest.display_name || quest.id,
			description: quest.description || '',
			enabled: quest.enabled !== undefined ? quest.enabled : true,
			is_faction_quest: quest.is_faction_quest || false,
			quest_type: quest.quest_type || 'repeat',
			tier: quest.tier || 1,
			timer_seconds: quest.timer_seconds || 0,
			tags: Array.isArray(quest.tags) ? quest.tags.join(',') : '',
			objectives: JSON.stringify(quest.objectives || []),
			rewards: JSON.stringify(quest.rewards || [])
		};

		await pool.query(`
			INSERT INTO ${prefix}quest_definitions 
			(id, display_name, description, enabled, is_faction_quest, quest_type, tier, timer_seconds, tags, objectives, rewards)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
			display_name = VALUES(display_name),
			description = VALUES(description),
			enabled = VALUES(enabled),
			is_faction_quest = VALUES(is_faction_quest),
			quest_type = VALUES(quest_type),
			tier = VALUES(tier),
			timer_seconds = VALUES(timer_seconds),
			tags = VALUES(tags),
			objectives = VALUES(objectives),
			rewards = VALUES(rewards)
		`, [
			questData.id, questData.display_name, questData.description,
			questData.enabled, questData.is_faction_quest, questData.quest_type, questData.tier,
			questData.timer_seconds, questData.tags, questData.objectives, questData.rewards
		]);

		res.json({ success: true, message: 'Quest saved successfully' });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ==================== PLAYERS ====================

// Get all players from PlayerStatsNew table
app.get('/api/players', async (req, res) => {
	try {
		const pool = getDbPool();
		
		// Check if PlayerStatsNew table exists
		const [dbInfo] = await pool.query('SELECT DATABASE() as db');
		const dbName = dbInfo[0].db;
		
		const [tables] = await pool.query(`
			SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'PlayerStatsNew'
		`, [dbName]);
		
		console.log(`[API] /api/players - Checking table PlayerStatsNew in database: ${dbName}`);
		console.log(`[API] /api/players - Table exists: ${tables.length > 0}`);
		
		if (tables.length === 0) {
			console.log(`[API] /api/players - PlayerStatsNew table not found`);
			return res.json([]);
		}
		
		// Get all players from PlayerStatsNew
		// Note: XPDonated column doesn't exist in PlayerStatsNew table
		const [players] = await pool.query(`
			SELECT 
				CAST(SteamId AS CHAR) as SteamId,
				Name,
				Kills,
				Headshots,
				PVPDeaths,
				PVEDeaths,
				Zombies,
				MegaZombies,
				Animals,
				Resources,
				Harvests,
				Fish,
				Structures,
				Barricades,
				Playtime,
				UIDisabled,
				LastUpdated
			FROM PlayerStatsNew
			ORDER BY LastUpdated DESC
			LIMIT 1000
		`);

		console.log(`[API] /api/players - Found ${players.length} players from PlayerStatsNew`);
		if (players.length > 0) {
			console.log(`[API] First player sample:`, JSON.stringify(players[0], null, 2));
		} else {
			console.log(`[API] /api/players - No players found in PlayerStatsNew table`);
		}

		res.json(players);
	} catch (error) {
		console.error('Error fetching players:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get player stats from PlayerStatsNew table
app.get('/api/players/:id/stats', async (req, res) => {
	try {
		const pool = getDbPool();
		const playerId = req.params.id;
		
		// Check if PlayerStatsNew table exists
		const [tables] = await pool.query(`
			SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PlayerStatsNew'
		`);
		
		if (tables.length === 0) {
			return res.status(404).json({ error: 'PlayerStatsNew table does not exist' });
		}
		
		// Try to find player by SteamId (can be string or number)
		// Use same column structure as FactionWebManager
		const [stats] = await pool.query(`
			SELECT 
				CAST(SteamId AS CHAR) as SteamId,
				Name,
				Kills,
				Headshots,
				PVPDeaths,
				PVEDeaths,
				Zombies,
				MegaZombies,
				Animals,
				Resources,
				Harvests,
				Fish,
				Structures,
				Barricades,
				Playtime,
				UIDisabled,
				LastUpdated
			FROM PlayerStatsNew 
			WHERE SteamId = ? OR CAST(SteamId AS CHAR) = ? OR CAST(SteamId AS UNSIGNED) = ?
			LIMIT 1
		`, [playerId, playerId, playerId]);
		
		if (stats.length === 0) {
			return res.status(404).json({ error: 'Player stats not found' });
		}
		
		// Return only data from PlayerStatsNew table (no mapping/aliases)
		res.json(stats[0]);
	} catch (error) {
		console.error('Error fetching player stats:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get player details
app.get('/api/players/:id', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const playerId = req.params.id;

		const [progress] = await pool.query(`
			SELECT qp.player_id, qp.quest_id, qp.is_active, qp.is_ready_to_complete, 
				qp.objective_progress, qp.started_at, qp.last_completed_at,
				qd.display_name, qd.description, qd.is_faction_quest
			FROM ${prefix}quest_progress qp
			LEFT JOIN ${prefix}quest_definitions qd ON qp.quest_id = qd.id
			WHERE qp.player_id = ?
			ORDER BY qp.is_active DESC, qp.last_completed_at DESC
		`, [playerId]);

		const parsedProgress = progress.map(p => ({
			...p,
			objective_progress: p.objective_progress ? JSON.parse(p.objective_progress) : []
		}));

		// Get faction membership
		const [membership] = await pool.query(`
			SELECT fm.faction_id, fm.player_id, fm.joined_at,
				f.name as faction_name, f.tag as faction_tag
			FROM ${prefix}faction_members fm
			LEFT JOIN ${prefix}factions f ON fm.faction_id = f.id
			WHERE fm.player_id = ?
		`, [playerId]);

		res.json({
			player_id: playerId,
			quests: parsedProgress,
			faction: membership.length > 0 ? membership[0] : null
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ==================== SHOP ITEMS ====================

// Get all shop items
app.get('/api/shop/items', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;

		const [items] = await pool.query(`
			SELECT 
				id,
				name,
				reward_type,
				item_id,
				amount,
				cost_xp,
				cost_faction_xp,
				sell_price,
				command,
				enabled,
				created_at,
				updated_at
			FROM ${prefix}shop_items
			ORDER BY id
		`);

		res.json(items);
	} catch (error) {
		console.error('Error fetching shop items:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get single shop item
app.get('/api/shop/items/:id', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const itemId = parseInt(req.params.id);

		const [items] = await pool.query(`
			SELECT 
				id,
				name,
				reward_type,
				item_id,
				amount,
				cost_xp,
				cost_faction_xp,
				sell_price,
				command,
				enabled,
				created_at,
				updated_at
			FROM ${prefix}shop_items
			WHERE id = ?
		`, [itemId]);

		if (items.length === 0) {
			return res.status(404).json({ error: 'Shop item not found' });
		}

		res.json(items[0]);
	} catch (error) {
		console.error('Error fetching shop item:', error);
		res.status(500).json({ error: error.message });
	}
});

// Create/Update shop item
app.post('/api/shop/items', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const item = req.body;

		// Validate required fields
		if (!item.id || !item.name || !item.reward_type) {
			return res.status(400).json({ error: 'Missing required fields: id, name, reward_type' });
		}

		await pool.query(`
			INSERT INTO ${prefix}shop_items 
			(id, name, reward_type, item_id, amount, cost_xp, cost_faction_xp, sell_price, command, enabled)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				name = VALUES(name),
				reward_type = VALUES(reward_type),
				item_id = VALUES(item_id),
				amount = VALUES(amount),
				cost_xp = VALUES(cost_xp),
				cost_faction_xp = VALUES(cost_faction_xp),
				sell_price = VALUES(sell_price),
				command = VALUES(command),
				enabled = VALUES(enabled),
				updated_at = CURRENT_TIMESTAMP
		`, [
			item.id,
			item.name,
			item.reward_type,
			item.item_id || 0,
			item.amount || 1,
			item.cost_xp || 1, // Default = 1
			item.cost_faction_xp || item.cost_xp || 1, // Sync dengan cost_xp jika tidak di-set, default = 1
			item.sell_price || 0,
			item.command || null,
			item.enabled !== undefined ? item.enabled : true
		]);

		res.json({ success: true, message: 'Shop item saved successfully' });
	} catch (error) {
		console.error('Error saving shop item:', error);
		res.status(500).json({ error: error.message });
	}
});

// Delete shop item
app.delete('/api/shop/items/:id', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const itemId = parseInt(req.params.id);

		const [result] = await pool.query(`
			DELETE FROM ${prefix}shop_items
			WHERE id = ?
		`, [itemId]);

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: 'Shop item not found' });
		}

		res.json({ success: true, message: 'Shop item deleted successfully' });
	} catch (error) {
		console.error('Error deleting shop item:', error);
		res.status(500).json({ error: error.message });
	}
});

// ==================== FACTION QUESTS ====================

// Get faction quests
app.get('/api/faction-quests/:factionId', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const factionId = req.params.factionId;

		const [factionQuests] = await pool.query(`
			SELECT fq.*, qd.display_name, qd.description
			FROM ${prefix}faction_quests fq
			LEFT JOIN ${prefix}quest_definitions qd ON fq.quest_id = qd.id
			WHERE fq.faction_id = ?
			ORDER BY fq.started_at DESC
		`, [factionId]);

		res.json(factionQuests);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ==================== PLAYER AUTHENTICATION ====================

// Login with auth code
app.post('/api/auth/login', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const { code } = req.body;

		if (!code) {
			return res.status(400).json({ error: 'Auth code is required' });
		}

		// Search for auth code in player_auth table
		// Cast steam_id to CHAR to prevent JavaScript number precision loss
		const [authData] = await pool.query(`
			SELECT CAST(steam_id AS CHAR) as steam_id, auth_code, created_at_utc, last_used_at_utc
			FROM ${prefix}player_auth
			WHERE UPPER(auth_code) = UPPER(?)
			LIMIT 1
		`, [code.trim()]);

		let steamId = null;
		if (authData.length > 0) {
			// Always treat steam_id as string to prevent precision loss
			steamId = authData[0].steam_id.toString();
			console.log(`[API] Login: Retrieved steam_id from DB: ${authData[0].steam_id} (raw), ${steamId} (as string)`);
			// Update last used time
			await pool.query(`
				UPDATE ${prefix}player_auth
				SET last_used_at_utc = NOW()
				WHERE steam_id = ?
			`, [steamId]);
		}

		if (!steamId) {
			return res.status(401).json({ error: 'Invalid auth code' });
		}

		// Get player info
		const [players] = await pool.query(`
			SELECT CAST(SteamId AS CHAR) as SteamId, Name
			FROM PlayerStatsNew
			WHERE SteamId = ? OR CAST(SteamId AS CHAR) = ?
			LIMIT 1
		`, [steamId, steamId]);

		const player = players.length > 0 ? players[0] : null;

		res.json({
			success: true,
			steamId: steamId.toString(),
			playerName: player ? player.Name : 'Unknown',
			token: code // Simple token for session (in production, use JWT)
		});
	} catch (error) {
		console.error('Error during login:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get player quests (requires auth)
app.get('/api/player/quests', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const authCode = req.headers['x-auth-code'] || req.query.code;

		if (!authCode) {
			return res.status(401).json({ error: 'Auth code required' });
		}

		// Get SteamID from auth code
		// Cast steam_id to CHAR to prevent JavaScript number precision loss
		const [authData] = await pool.query(`
			SELECT CAST(steam_id AS CHAR) as steam_id
			FROM ${prefix}player_auth
			WHERE UPPER(auth_code) = UPPER(?)
			LIMIT 1
		`, [authCode.trim()]);

		let steamId = null;
		if (authData.length > 0) {
			// Always treat steam_id as string to prevent precision loss
			steamId = authData[0].steam_id.toString();
		}

		if (!steamId) {
			return res.status(401).json({ error: 'Invalid auth code' });
		}

		// Get player quests from quest_progress table (player_id is now VARCHAR/string)
		const playerIdStr = steamId.toString();
		const [quests] = await pool.query(`
			SELECT 
				qp.quest_id,
				qd.display_name,
				qd.description,
				qp.is_active,
				qp.is_ready_to_complete,
				qp.objective_progress,
				qp.started_at,
				qp.last_completed_at,
				qd.is_faction_quest,
				qd.objectives,
				qd.rewards
			FROM ${prefix}quest_progress qp
			LEFT JOIN ${prefix}quest_definitions qd ON qp.quest_id = qd.id
			WHERE qp.player_id = ?
			ORDER BY qp.is_active DESC, qp.started_at DESC
		`, [playerIdStr]);

		const parsedQuests = quests.map(q => {
			let objectiveProgress = [];
			try {
				objectiveProgress = q.objective_progress ? JSON.parse(q.objective_progress) : [];
			} catch (e) {
				console.error(`Error parsing objective_progress for quest ${q.quest_id}:`, e);
			}

			let objectives = [];
			try {
				objectives = q.objectives ? JSON.parse(q.objectives) : [];
			} catch (e) {
				console.error(`Error parsing objectives for quest ${q.quest_id}:`, e);
			}

			let rewards = [];
			try {
				rewards = q.rewards ? JSON.parse(q.rewards) : [];
			} catch (e) {
				console.error(`Error parsing rewards for quest ${q.quest_id}:`, e);
			}

			// Match objectives with progress
			const objectivesWithProgress = objectives.map(obj => {
				const progress = objectiveProgress.find(p => p.ObjectiveId === obj.Id);
				return {
					...obj,
					currentValue: progress ? progress.CurrentValue : 0,
					completed: progress ? progress.Completed : false,
					targetValue: obj.TargetValue || 0
				};
			});

			return {
				...q,
				objective_progress: objectiveProgress,
				objectives: objectivesWithProgress,
				rewards: rewards
			};
		});

		res.json({
			steamId: steamId.toString(),
			quests: parsedQuests
		});
	} catch (error) {
		console.error('Error fetching player quests:', error);
		res.status(500).json({ error: error.message });
	}
});

// Get available quests for player
app.get('/api/player/available-quests', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const authCode = req.headers['x-auth-code'] || req.query.code;

		if (!authCode) {
			return res.status(401).json({ error: 'Auth code required' });
		}

		// Get SteamID from auth code - use player_auth table
		// Cast steam_id to CHAR to prevent JavaScript number precision loss
		const [authData] = await pool.query(`
			SELECT CAST(steam_id AS CHAR) as steam_id
			FROM ${prefix}player_auth
			WHERE UPPER(auth_code) = UPPER(?)
			LIMIT 1
		`, [authCode.trim()]);

		let steamId = null;
		if (authData.length > 0) {
			// Always treat steam_id as string to prevent precision loss
			steamId = authData[0].steam_id.toString();
		}

		if (!steamId) {
			return res.status(401).json({ error: 'Invalid auth code' });
		}

		// Get player's faction (if any) - player_id is now VARCHAR/string
		const playerIdStr = steamId.toString();
		const [factionMembers] = await pool.query(`
			SELECT faction_id
			FROM ${prefix}faction_members
			WHERE player_id = ?
			LIMIT 1
		`, [playerIdStr]);

		const playerFactionId = factionMembers.length > 0 ? factionMembers[0].faction_id : null;

		// Get all enabled quests (non-faction OR faction quests if player is in faction)
		let questQuery = `
			SELECT *
			FROM ${prefix}quest_definitions
			WHERE enabled = 1
		`;
		
		if (playerFactionId) {
			// Player is in faction: show both non-faction and faction quests
			questQuery += ` AND (is_faction_quest = 0 OR is_faction_quest = 1)`;
		} else {
			// Player not in faction: only show non-faction quests
			questQuery += ` AND is_faction_quest = 0`;
		}
		
		questQuery += ` ORDER BY id`;

		const [allQuests] = await pool.query(questQuery);

		// Get player's active quests (player_id is now VARCHAR/string)
		const [activeQuests] = await pool.query(`
			SELECT quest_id
			FROM ${prefix}quest_progress
			WHERE player_id = ? AND is_active = 1
		`, [playerIdStr]);

		const activeQuestIds = new Set(activeQuests.map(q => q.quest_id));

		const availableQuests = allQuests.map(q => ({
			...q,
			tags: q.tags ? q.tags.split(',').filter(t => t.trim()) : [],
			objectives: q.objectives ? JSON.parse(q.objectives) : [],
			rewards: q.rewards ? JSON.parse(q.rewards) : [],
			isTaken: activeQuestIds.has(q.id)
		}));

		res.json({
			steamId: steamId.toString(),
			playerFactionId: playerFactionId,
			quests: availableQuests
		});
	} catch (error) {
		console.error('Error fetching available quests:', error);
		res.status(500).json({ error: error.message });
	}
});

// Assign quest to player
app.post('/api/player/assign-quest', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const authCode = req.headers['x-auth-code'] || req.body.code;
		const { questId } = req.body;

		if (!authCode) {
			return res.status(401).json({ error: 'Auth code required' });
		}

		if (!questId) {
			return res.status(400).json({ error: 'Quest ID is required' });
		}

		// Get SteamID from auth code
		// Cast steam_id to CHAR to prevent JavaScript number precision loss
		const [authData] = await pool.query(`
			SELECT CAST(steam_id AS CHAR) as steam_id
			FROM ${prefix}player_auth
			WHERE UPPER(auth_code) = UPPER(?)
			LIMIT 1
		`, [authCode.trim()]);

		let steamId = null;
		if (authData.length > 0) {
			// Always treat steam_id as string to prevent precision loss
			steamId = authData[0].steam_id.toString();
		}

		if (!steamId) {
			return res.status(401).json({ error: 'Invalid auth code' });
		}

		// Get player's faction (if any) - player_id is now VARCHAR/string
		const playerIdStr = steamId.toString();
		const [factionMembers] = await pool.query(`
			SELECT faction_id
			FROM ${prefix}faction_members
			WHERE player_id = ?
			LIMIT 1
		`, [playerIdStr]);

		const playerFactionId = factionMembers.length > 0 ? factionMembers[0].faction_id : null;

		// Check if quest exists and is enabled
		// If quest is faction quest, player must be in faction
		let questQuery = `
			SELECT *
			FROM ${prefix}quest_definitions
			WHERE id = ? AND enabled = 1
		`;
		
		if (playerFactionId) {
			// Player is in faction: can take both non-faction and faction quests
			questQuery += ` AND (is_faction_quest = 0 OR is_faction_quest = 1)`;
		} else {
			// Player not in faction: can only take non-faction quests
			questQuery += ` AND is_faction_quest = 0`;
		}

		const [quests] = await pool.query(questQuery, [questId]);

		if (quests.length === 0) {
			const questCheck = await pool.query(`SELECT is_faction_quest FROM ${prefix}quest_definitions WHERE id = ?`, [questId]);
			if (questCheck.length > 0 && questCheck[0].is_faction_quest && !playerFactionId) {
				return res.status(403).json({ error: 'You are not in a faction. This quest requires faction membership.' });
			}
			return res.status(404).json({ error: 'Quest not found or not available' });
		}

		const quest = quests[0];

		// Check if player already has this quest active (player_id is now VARCHAR/string)
		const [existing] = await pool.query(`
			SELECT *
			FROM ${prefix}quest_progress
			WHERE player_id = ? AND quest_id = ? AND is_active = 1
		`, [playerIdStr, questId]);

		if (existing.length > 0) {
			console.log(`[API] Quest ${questId} is already active for player ${playerIdStr}`);
			return res.status(400).json({ error: 'Quest already active' });
		}
		
		// Check if quest exists but is inactive (for logging)
		const [inactive] = await pool.query(`
			SELECT *
			FROM ${prefix}quest_progress
			WHERE player_id = ? AND quest_id = ? AND is_active = 0
		`, [playerIdStr, questId]);
		
		if (inactive.length > 0) {
			console.log(`[API] Quest ${questId} exists but is inactive for player ${playerIdStr}, will be reactivated`);
		}

		// Create or update quest progress
		const objectives = quest.objectives ? JSON.parse(quest.objectives) : [];
		const objectiveProgress = objectives.map(obj => ({
			ObjectiveId: obj.Id,
			CurrentValue: 0,
			Completed: false,
			LastUpdatedUtc: new Date().toISOString() // ISO 8601 format for C# DateTime deserialization
		}));
		
		const objectiveProgressJson = JSON.stringify(objectiveProgress);
		console.log(`[API] Assign quest: Player ${playerIdStr}, Quest ${questId}, Objectives: ${objectives.length}, Progress entries: ${objectiveProgress.length}`);
		console.log(`[API] Objective progress JSON: ${objectiveProgressJson}`);

		// Insert or update quest progress
		let result;
		try {
			[result] = await pool.query(`
				INSERT INTO ${prefix}quest_progress 
				(player_id, quest_id, is_active, is_ready_to_complete, objective_progress, started_at)
				VALUES (?, ?, 1, 0, ?, NOW())
				ON DUPLICATE KEY UPDATE
					is_active = 1,
					is_ready_to_complete = 0,
					objective_progress = VALUES(objective_progress),
					started_at = NOW(),
					updated_at = NOW()
			`, [
				playerIdStr,
				questId,
				objectiveProgressJson
			]);
			console.log(`[API] Quest assigned: Insert/Update result - affectedRows: ${result.affectedRows}, insertId: ${result.insertId}`);
		} catch (dbError) {
			console.error(`[API] Database error when inserting quest progress:`, dbError);
			// Check if it's a foreign key constraint error
			if (dbError.code === 'ER_NO_REFERENCED_ROW_2' || dbError.code === '1452') {
				return res.status(400).json({ error: `Quest ${questId} does not exist in quest_definitions table` });
			}
			throw dbError; // Re-throw other errors
		}

		// Verify the data was saved
		const [verify] = await pool.query(`
			SELECT player_id, quest_id, is_active, started_at, objective_progress
			FROM ${prefix}quest_progress
			WHERE player_id = ? AND quest_id = ?
		`, [playerIdStr, questId]);

		if (verify.length === 0) {
			console.error(`[API] ERROR: Quest progress was not saved! Player ${playerIdStr}, Quest ${questId}`);
			return res.status(500).json({ error: 'Failed to save quest progress to database' });
		}

		console.log(`[API] Verified: Quest progress saved successfully. Active: ${verify[0].is_active}, Started: ${verify[0].started_at}`);

		res.json({
			success: true,
			message: 'Quest assigned successfully',
			questId: questId,
			playerId: playerIdStr
		});
	} catch (error) {
		console.error('Error assigning quest:', error);
		res.status(500).json({ error: error.message });
	}
});

// Turn in quest (requires auth)
app.post('/api/player/turn-in-quest', async (req, res) => {
	try {
		const pool = getDbPool();
		const prefix = tablePrefix;
		const authCode = req.headers['x-auth-code'] || req.body.code;
		const { questId } = req.body;

		if (!authCode) {
			return res.status(401).json({ error: 'Auth code required' });
		}

		if (!questId) {
			return res.status(400).json({ error: 'Quest ID is required' });
		}

		// Get SteamID from auth code
		const [authData] = await pool.query(`
			SELECT CAST(steam_id AS CHAR) as steam_id
			FROM ${prefix}player_auth
			WHERE UPPER(auth_code) = UPPER(?)
			LIMIT 1
		`, [authCode.trim()]);

		let steamId = null;
		if (authData.length > 0) {
			steamId = authData[0].steam_id.toString();
		}

		if (!steamId) {
			return res.status(401).json({ error: 'Invalid auth code' });
		}

		const playerIdStr = steamId.toString();

		// Check if quest is active and ready to complete
		const [questProgress] = await pool.query(`
			SELECT 
				qp.quest_id,
				qp.is_active,
				qp.is_ready_to_complete,
				qd.is_faction_quest
			FROM ${prefix}quest_progress qp
			LEFT JOIN ${prefix}quest_definitions qd ON qp.quest_id = qd.id
			WHERE qp.player_id = ? AND qp.quest_id = ?
			LIMIT 1
		`, [playerIdStr, questId]);

		if (questProgress.length === 0) {
			return res.status(404).json({ error: 'Quest not found' });
		}

		const quest = questProgress[0];

		if (!quest.is_active) {
			return res.status(400).json({ error: 'Quest is not active' });
		}

		if (!quest.is_ready_to_complete) {
			return res.status(400).json({ error: 'Quest is not ready to complete. Please complete all objectives first.' });
		}

		// For faction quests, check if player is leader or vice leader
		if (quest.is_faction_quest) {
			const [factionMembers] = await pool.query(`
				SELECT faction_id, leader_id, role_level
				FROM ${prefix}faction_members
				WHERE player_id = ?
				LIMIT 1
			`, [playerIdStr]);

			if (factionMembers.length === 0) {
				return res.status(403).json({ error: 'You are not in a faction' });
			}

			const faction = factionMembers[0];
			const isLeader = faction.leader_id === playerIdStr;
			const isViceLeader = faction.role_level === 2; // VICE_LEADER = 2
			
			if (!isLeader && !isViceLeader) {
				return res.status(403).json({ error: 'Only faction leader or vice leader can turn in faction quests' });
			}
		}

		// Insert turn-in request to database queue (plugin will poll and process)
		try {
			const pool = getDbPool();
			const prefix = tablePrefix;
			
			// Insert into queue table
			const [result] = await pool.query(`
				INSERT INTO ${prefix}quest_turnin_queue (steam_id, quest_id, status, created_at)
				VALUES (?, ?, 'pending', NOW())
			`, [playerIdStr, questId]);

			console.log(`[API] Quest turn-in request queued: ${questId} for player ${playerIdStr} (queue ID: ${result.insertId})`);

			return res.json({
				success: true,
				message: 'Quest turn-in request has been queued. It will be processed within 5 seconds.',
				questId: questId,
				playerId: playerIdStr,
				queueId: result.insertId,
				note: 'The quest will be turned in automatically. Please wait a moment.'
			});
		} catch (error) {
			console.error(`[API] Error queuing turn-in request: ${error.message}`, error);
			return res.status(500).json({
				success: false,
				error: 'Failed to queue turn-in request: ' + error.message,
				questId: questId,
				playerId: playerIdStr,
				note: 'You can also use the command in-game: /sq turnin ' + questId
			});
		}
	} catch (error) {
		console.error('Error turning in quest:', error);
		res.status(500).json({ error: error.message });
	}
});

// ==================== FACTION MANAGEMENT (ROLE-BASED) ====================

app.post('/api/player/faction/info', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		if (!code) {
			return res.status(400).json({ success: false, error: 'code_required' });
		}

		const steamId = await getSteamIdFromAuthCode(code);
		if (!steamId) {
			return res.status(401).json({ success: false, error: 'invalid_code' });
		}

		const pool = getDbPool();
		const prefix = tablePrefix;

		const [factionRows] = await pool.query(`
			SELECT 
				f.id,
				f.name,
				f.tag,
				f.color,
				f.icon_url,
				CAST(f.leader_id AS CHAR) AS leader_id,
				fs.faction_points,
				fs.faction_xp,
				fs.tier,
				fs.unlock_flags
			FROM ${prefix}faction_members fm
			JOIN ${prefix}factions f ON fm.faction_id = f.id
			LEFT JOIN ${prefix}faction_states fs ON fs.faction_id = f.id
			WHERE fm.player_id = ?
			LIMIT 1
		`, [steamId]);

		if (factionRows.length === 0) {
			const payload = {
				success: true,
				faction: null,
				role: 'None',
				role_level: -1,
				role_display: 'No Faction',
				permissions: buildFactionPermissions(FACTION_ROLE.NONE),
				members: [],
				invitations: [],
				join_requests: [],
				aliases: {}
			};
			return res.json(payload);
		}

		const faction = factionRows[0];
		const factionId = faction.id;

		// Load members
		const [memberRows] = await pool.query(`
			SELECT CAST(player_id AS CHAR) AS player_id, role, joined_at
			FROM ${prefix}faction_members
			WHERE faction_id = ?
		`, [factionId]);

		const [aliasRows] = await pool.query(`
			SELECT role, alias
			FROM ${prefix}faction_role_aliases
			WHERE faction_id = ?
		`, [factionId]);

		const [invitationRows] = await pool.query(`
			SELECT CAST(invited_player_id AS CHAR) AS invited_player_id, CAST(inviter_id AS CHAR) AS inviter_id, created_at, expires_at
			FROM ${prefix}faction_invitations
			WHERE faction_id = ? AND expires_at > NOW()
		`, [factionId]);

		const [joinRequestRows] = await pool.query(`
			SELECT CAST(player_id AS CHAR) AS player_id, created_at, expires_at
			FROM ${prefix}faction_join_requests
			WHERE faction_id = ? AND expires_at > NOW()
		`, [factionId]);

		const aliasMap = {};
		aliasRows.forEach(row => {
			if (row && row.alias != null) {
				aliasMap[String(row.role)] = row.alias;
			}
		});

		const leaderId = normalizeSteamId(faction.leader_id);

		const members = memberRows.map(row => {
			const memberSteamId = normalizeSteamId(row.player_id);
			const roleLevel = typeof row.role === 'number' ? parseInt(row.role, 10) : parseInt(row.role || 0, 10);
			const normalizedRole = Number.isNaN(roleLevel) ? FACTION_ROLE.MEMBER : roleLevel;
			return {
				steamId: memberSteamId,
				role: getRoleNameFromLevel(normalizedRole),
				role_level: normalizedRole,
				role_display: getRoleDisplayFromLevel(normalizedRole, aliasMap),
				is_leader: leaderId === memberSteamId,
				joined_at: row.joined_at
			};
		}).sort((a, b) => {
			if (b.role_level !== a.role_level) return b.role_level - a.role_level;
			return (a.steamId || '').localeCompare(b.steamId || '');
		});

		const playerMember = members.find(m => m.steamId === steamId);
		const playerRoleLevel = playerMember ? playerMember.role_level : FACTION_ROLE.MEMBER;

		const invitations = invitationRows.map(inv => ({
			steamId: normalizeSteamId(inv.invited_player_id),
			inviterId: normalizeSteamId(inv.inviter_id),
			createdAt: inv.created_at,
			expiresAt: inv.expires_at
		}));

		const joinRequests = joinRequestRows.map(req => ({
			steamId: normalizeSteamId(req.player_id),
			createdAt: req.created_at,
			expiresAt: req.expires_at
		}));

		const payload = await attachNamesToFactionData({
			success: true,
			faction: {
				id: faction.id,
				name: faction.name,
				tag: faction.tag,
				color: faction.color,
				iconUrl: faction.icon_url,
				leaderId: leaderId,
				faction_points: faction.faction_points || 0,
				faction_xp: faction.faction_xp || 0,
				tier: faction.tier || 1,
				unlock_flags: faction.unlock_flags || null
			},
			role: getRoleNameFromLevel(playerRoleLevel),
			role_level: playerRoleLevel,
			role_display: getRoleDisplayFromLevel(playerRoleLevel, aliasMap),
			permissions: buildFactionPermissions(playerRoleLevel),
			members,
			invitations,
			join_requests: joinRequests,
			aliases: aliasMap
		});

		return res.json(payload);
	} catch (error) {
		console.error('[Faction] /api/player/faction/info error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

app.post('/api/player/faction/invite', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		const targetSteamId = req.body?.targetSteamId || req.body?.target;

		if (!code || !targetSteamId) {
			return res.status(400).json({ success: false, error: 'code_and_target_required' });
		}

		const pluginRes = await callPluginApi('/api/faction/invite', { code, targetSteamId });
		return res.status(pluginRes.statusCode || 200).json(pluginRes.data || { success: false });
	} catch (error) {
		console.error('[Faction] /api/player/faction/invite error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

app.post('/api/player/faction/accept-request', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		const targetSteamId = req.body?.targetSteamId || req.body?.target;

		if (!code || !targetSteamId) {
			return res.status(400).json({ success: false, error: 'code_and_target_required' });
		}

		const pluginRes = await callPluginApi('/api/faction/accept-request', { code, targetSteamId });
		return res.status(pluginRes.statusCode || 200).json(pluginRes.data || { success: false });
	} catch (error) {
		console.error('[Faction] /api/player/faction/accept-request error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

app.post('/api/player/faction/reject-request', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		const targetSteamId = req.body?.targetSteamId || req.body?.target;

		if (!code || !targetSteamId) {
			return res.status(400).json({ success: false, error: 'code_and_target_required' });
		}

		const pluginRes = await callPluginApi('/api/faction/reject-request', { code, targetSteamId });
		return res.status(pluginRes.statusCode || 200).json(pluginRes.data || { success: false });
	} catch (error) {
		console.error('[Faction] /api/player/faction/reject-request error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

app.post('/api/player/faction/set-role', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		const targetSteamId = req.body?.targetSteamId || req.body?.target;
		const role = req.body?.role;

		if (!code || !targetSteamId || typeof role === 'undefined') {
			return res.status(400).json({ success: false, error: 'code_target_role_required' });
		}

		// Validate and normalize role value
		// Accept both number and string (role name or level)
		let roleLevel;
		if (typeof role === 'number') {
			roleLevel = role;
		} else if (typeof role === 'string') {
			// Try to parse as number first
			const parsed = parseInt(role, 10);
			if (!isNaN(parsed)) {
				roleLevel = parsed;
			} else {
				// Try to match role name
				const roleNameMap = {
					'member': FACTION_ROLE.MEMBER,
					'officer': FACTION_ROLE.OFFICER,
					'viceleader': FACTION_ROLE.VICE_LEADER,
					'vice_leader': FACTION_ROLE.VICE_LEADER,
					'leader': FACTION_ROLE.LEADER
				};
				roleLevel = roleNameMap[role.toLowerCase()];
			}
		} else {
			roleLevel = undefined;
		}

		if (roleLevel === undefined || isNaN(roleLevel) || roleLevel < FACTION_ROLE.MEMBER || roleLevel > FACTION_ROLE.LEADER) {
			return res.status(400).json({ 
				success: false, 
				error: 'invalid_role', 
				message: `Invalid role value. Expected number (0-3) or role name (Member, Officer, ViceLeader, Leader), got: ${JSON.stringify(role)}` 
			});
		}

		// Get SteamID from auth code to verify permissions
		const steamId = await getSteamIdFromAuthCode(code);
		if (!steamId) {
			return res.status(401).json({ success: false, error: 'invalid_code' });
		}

		// Check if user has permission to set this role
		const pool = getDbPool();
		const prefix = tablePrefix;

		// Get user's faction and role
		const [userFaction] = await pool.query(`
			SELECT fm.faction_id, fm.role, f.leader_id
			FROM ${prefix}faction_members fm
			JOIN ${prefix}factions f ON fm.faction_id = f.id
			WHERE fm.player_id = ?
			LIMIT 1
		`, [steamId]);

		if (userFaction.length === 0) {
			return res.status(403).json({ success: false, error: 'not_in_faction' });
		}

		const userFactionData = userFaction[0];
		const userRoleLevel = typeof userFactionData.role === 'number' 
			? userFactionData.role 
			: parseInt(userFactionData.role || 0, 10);
		const isLeader = normalizeSteamId(userFactionData.leader_id) === normalizeSteamId(steamId);

		// Check if target is in same faction
		const [targetFaction] = await pool.query(`
			SELECT faction_id, role
			FROM ${prefix}faction_members
			WHERE player_id = ? AND faction_id = ?
			LIMIT 1
		`, [targetSteamId, userFactionData.faction_id]);

		if (targetFaction.length === 0) {
			return res.status(404).json({ success: false, error: 'target_not_in_faction' });
		}

		// Permission checks
		const canPromoteOfficer = userRoleLevel >= FACTION_ROLE.VICE_LEADER;
		const canPromoteViceLeader = isLeader;
		const canTransferLeadership = isLeader;

		let canSetThisRole = false;
		if (roleLevel === FACTION_ROLE.MEMBER) {
			canSetThisRole = canPromoteOfficer || canPromoteViceLeader; // Can demote
		} else if (roleLevel === FACTION_ROLE.OFFICER) {
			canSetThisRole = canPromoteOfficer;
		} else if (roleLevel === FACTION_ROLE.VICE_LEADER) {
			canSetThisRole = canPromoteViceLeader;
		} else if (roleLevel === FACTION_ROLE.LEADER) {
			canSetThisRole = canTransferLeadership;
		}

		if (!canSetThisRole) {
			return res.status(403).json({ 
				success: false, 
				error: 'insufficient_permissions',
				message: 'You do not have permission to set this role'
			});
		}

		// Prevent setting yourself as non-leader if you're the leader
		if (normalizeSteamId(targetSteamId) === normalizeSteamId(steamId) && isLeader && roleLevel !== FACTION_ROLE.LEADER) {
			return res.status(400).json({ 
				success: false, 
				error: 'cannot_demote_self',
				message: 'Leader cannot demote themselves. Transfer leadership first.'
			});
		}

		// Try to call plugin API first
		let pluginRes;
		try {
			pluginRes = await callPluginApi('/api/faction/set-role', { code, targetSteamId, role: roleLevel });
			
			// If plugin API succeeds, return its response
			if (pluginRes.statusCode === 200 && pluginRes.data && pluginRes.data.success) {
				return res.status(200).json(pluginRes.data);
			}
			
			// If plugin API fails but returns data, log and try database update as fallback
			if (pluginRes.data && pluginRes.data.error) {
				console.warn(`[Faction] Plugin API error for set-role: ${pluginRes.data.error}, attempting database fallback`);
			}
		} catch (pluginError) {
			console.warn(`[Faction] Plugin API call failed: ${pluginError.message}, attempting database fallback`);
		}

		// Fallback: Update database directly if plugin API is unavailable
		try {
			await pool.query(`
				UPDATE ${prefix}faction_members
				SET role = ?
				WHERE player_id = ? AND faction_id = ?
			`, [roleLevel, targetSteamId, userFactionData.faction_id]);

			// If setting as leader, also update faction leader_id
			if (roleLevel === FACTION_ROLE.LEADER) {
				await pool.query(`
					UPDATE ${prefix}factions
					SET leader_id = ?
					WHERE id = ?
				`, [targetSteamId, userFactionData.faction_id]);
			}

			return res.status(200).json({ 
				success: true, 
				message: `Role set to ${getRoleNameFromLevel(roleLevel)} successfully`,
				role: getRoleNameFromLevel(roleLevel),
				role_level: roleLevel
			});
		} catch (dbError) {
			console.error('[Faction] Database error when setting role:', dbError);
			return res.status(500).json({ 
				success: false, 
				error: 'database_error', 
				message: dbError.message 
			});
		}
	} catch (error) {
		console.error('[Faction] /api/player/faction/set-role error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

app.post('/api/player/faction/set-alias', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		const role = req.body?.role;
		const alias = req.body?.alias || '';

		if (!code || typeof role === 'undefined') {
			return res.status(400).json({ success: false, error: 'code_and_role_required' });
		}

		const pluginRes = await callPluginApi('/api/faction/set-alias', { code, role, alias });
		return res.status(pluginRes.statusCode || 200).json(pluginRes.data || { success: false });
	} catch (error) {
		console.error('[Faction] /api/player/faction/set-alias error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

// Get available faction quests for assignment
app.post('/api/player/faction/available-quests', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		if (!code) {
			return res.status(400).json({ success: false, error: 'code_required' });
		}

		const steamId = await getSteamIdFromAuthCode(code);
		if (!steamId) {
			return res.status(401).json({ success: false, error: 'invalid_code' });
		}

		const pool = getDbPool();
		const prefix = tablePrefix;

		// Get player's faction and tier
		const [factionRows] = await pool.query(`
			SELECT f.id, fs.tier
			FROM ${prefix}faction_members fm
			JOIN ${prefix}factions f ON fm.faction_id = f.id
			LEFT JOIN ${prefix}faction_states fs ON fs.faction_id = f.id
			WHERE fm.player_id = ?
			LIMIT 1
		`, [steamId]);

		if (factionRows.length === 0) {
			return res.status(403).json({ success: false, error: 'not_in_faction' });
		}

		const factionTier = factionRows[0].tier || 1;

		// Get available faction quests (is_faction_quest = 1, enabled = 1, tier <= faction tier)
		const [quests] = await pool.query(`
			SELECT id, display_name, description, tier, is_faction_quest, enabled
			FROM ${prefix}quest_definitions
			WHERE is_faction_quest = 1 
			AND enabled = 1
			AND tier <= ?
			ORDER BY tier, display_name
		`, [factionTier]);

		res.json({
			success: true,
			quests: quests.map(q => ({
				id: q.id,
				displayName: q.display_name,
				description: q.description,
				tier: q.tier || 1
			}))
		});
	} catch (error) {
		console.error('[Faction] /api/player/faction/available-quests error:', error);
		return res.status(500).json({ success: false, error: 'internal_error', message: error.message });
	}
});

// Assign quest to faction members
app.post('/api/player/faction/assign-quest', async (req, res) => {
	try {
		const code = extractAuthCode(req);
		const { questId, assignedMembers } = req.body;

		if (!code || !questId || !assignedMembers || !Array.isArray(assignedMembers) || assignedMembers.length === 0) {
			return res.status(400).json({ success: false, error: 'code_quest_members_required' });
		}

		const steamId = await getSteamIdFromAuthCode(code);
		if (!steamId) {
			return res.status(401).json({ success: false, error: 'invalid_code' });
		}

		const pool = getDbPool();
		const prefix = tablePrefix;

		// Get player's faction
		const [factionRows] = await pool.query(`
			SELECT fm.faction_id, fm.role, f.leader_id, fs.tier
			FROM ${prefix}faction_members fm
			JOIN ${prefix}factions f ON fm.faction_id = f.id
			LEFT JOIN ${prefix}faction_states fs ON fs.faction_id = f.id
			WHERE fm.player_id = ?
			LIMIT 1
		`, [steamId]);

		if (factionRows.length === 0) {
			return res.status(403).json({ success: false, error: 'not_in_faction' });
		}

		const factionData = factionRows[0];
		const userRoleLevel = typeof factionData.role === 'number' ? factionData.role : parseInt(factionData.role || 0, 10);
		const isLeader = normalizeSteamId(factionData.leader_id) === normalizeSteamId(steamId);

		// Check permission (Vice Leader or Leader can assign quests)
		if (userRoleLevel < FACTION_ROLE.VICE_LEADER && !isLeader) {
			return res.status(403).json({ success: false, error: 'insufficient_permissions', message: 'Only Vice Leader or Leader can assign quests' });
		}

		// Check if quest exists and is valid
		const [quests] = await pool.query(`
			SELECT id, display_name, tier, is_faction_quest, enabled, objectives
			FROM ${prefix}quest_definitions
			WHERE id = ? AND is_faction_quest = 1 AND enabled = 1
		`, [questId]);

		if (quests.length === 0) {
			return res.status(404).json({ success: false, error: 'quest_not_found' });
		}

		const quest = quests[0];
		if (quest.tier > (factionData.tier || 1)) {
			return res.status(400).json({ success: false, error: 'quest_tier_too_high', message: `Quest requires Tier ${quest.tier}, but faction is only Tier ${factionData.tier || 1}` });
		}

		// Verify all members are in the same faction
		const placeholders = assignedMembers.map(() => '?').join(',');
		const [memberRows] = await pool.query(`
			SELECT player_id
			FROM ${prefix}faction_members
			WHERE faction_id = ? AND player_id IN (${placeholders})
		`, [factionData.faction_id, ...assignedMembers]);

		if (memberRows.length !== assignedMembers.length) {
			return res.status(400).json({ success: false, error: 'invalid_members', message: 'Some members are not in your faction' });
		}

		// Parse objectives from quest data
		let objectives = [];
		try {
			if (quest.objectives) {
				if (typeof quest.objectives === 'string') {
					objectives = JSON.parse(quest.objectives);
				} else if (Array.isArray(quest.objectives)) {
					objectives = quest.objectives;
				}
			}
		} catch (parseError) {
			console.error(`[API] Failed to parse objectives for quest ${questId}:`, parseError);
			objectives = [];
		}
		
		const objectiveProgress = objectives.map(obj => ({
			ObjectiveId: obj.Id || obj.ObjectiveId || obj.id || 'unknown',
			CurrentValue: 0,
			Completed: false,
			LastUpdatedUtc: new Date().toISOString()
		}));
		const objectiveProgressJson = JSON.stringify(objectiveProgress);

		// Assign quest to each member directly in database
		const assignedCount = [];
		const failedMembers = [];

		for (const memberSteamId of assignedMembers) {
			try {
				// Check if quest already active for this member
				const [existing] = await pool.query(`
					SELECT id
					FROM ${prefix}quest_progress
					WHERE player_id = ? AND quest_id = ? AND is_active = 1
				`, [memberSteamId, questId]);

				if (existing.length > 0) {
					failedMembers.push({ steamId: memberSteamId, reason: 'Quest already active' });
					continue;
				}

				// Insert quest progress
				await pool.query(`
					INSERT INTO ${prefix}quest_progress 
					(player_id, quest_id, is_active, is_ready_to_complete, objective_progress, started_at)
					VALUES (?, ?, 1, 0, ?, NOW())
					ON DUPLICATE KEY UPDATE
						is_active = 1,
						is_ready_to_complete = 0,
						objective_progress = VALUES(objective_progress),
						started_at = NOW(),
						updated_at = NOW()
				`, [memberSteamId, questId, objectiveProgressJson]);

				// Insert/update faction_quests tracking (only once per quest, not per member)
				// This is done outside the member loop to avoid duplicate queries
				// We'll handle this after the member loop

				assignedCount.push(memberSteamId);
			} catch (memberError) {
				console.error(`[API] Failed to assign quest to member ${memberSteamId}:`, memberError);
				failedMembers.push({ steamId: memberSteamId, reason: memberError.message });
			}
		}

		// Insert/update faction_quests tracking (only once per quest, not per member)
		if (assignedCount.length > 0) {
			try {
				// Check if faction quest already exists
				const [existingFactionQuest] = await pool.query(`
					SELECT id FROM ${prefix}faction_quests
					WHERE faction_id = ? AND quest_id = ?
				`, [factionData.faction_id, questId]);

				// Get quest timer for expires_at
				const [questTimer] = await pool.query(`
					SELECT timer_seconds FROM ${prefix}quest_definitions WHERE id = ?
				`, [questId]);
				
				const timerSeconds = questTimer.length > 0 ? (questTimer[0].timer_seconds || 3600) : 3600;
				const expiresAt = new Date(Date.now() + timerSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');

				if (existingFactionQuest.length === 0) {
					// Insert new faction quest
					await pool.query(`
						INSERT INTO ${prefix}faction_quests 
						(faction_id, quest_id, started_at, expires_at, is_active, is_completed)
						VALUES (?, ?, NOW(), ?, 1, 0)
					`, [factionData.faction_id, questId, expiresAt]);
				} else {
					// Update existing faction quest to reactivate it
					await pool.query(`
						UPDATE ${prefix}faction_quests
						SET started_at = NOW(),
							expires_at = ?,
							is_active = 1,
							is_completed = 0,
							is_failed = 0
						WHERE faction_id = ? AND quest_id = ?
					`, [expiresAt, factionData.faction_id, questId]);
				}
			} catch (factionQuestError) {
				console.error(`[API] Failed to update faction_quests for quest ${questId}:`, factionQuestError);
				// Don't fail the whole request if faction_quests update fails
			}
		}

		if (assignedCount.length === 0) {
			return res.status(400).json({ 
				success: false, 
				error: 'assignment_failed', 
				message: 'Failed to assign quest to any members',
				failedMembers 
			});
		}

		return res.status(200).json({ 
			success: true, 
			message: `Quest assigned to ${assignedCount.length} member(s) successfully`,
			assignedCount: assignedCount.length,
			failedCount: failedMembers.length,
			failedMembers: failedMembers.length > 0 ? failedMembers : undefined
		});
	} catch (error) {
		console.error('[Faction] /api/player/faction/assign-quest error:', error);
		console.error('[Faction] Error stack:', error.stack);
		return res.status(500).json({ 
			success: false, 
			error: 'internal_error', 
			message: error.message || 'Internal server error',
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
		});
	}
});

// Serve frontend
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export for Vercel serverless
module.exports = app;

// Start server (only if not in Vercel environment)
if (process.env.VERCEL !== '1') {
	app.listen(PORT, () => {
		console.log(`🚀 KawePluginsStandalone Web Manager running on http://localhost:${PORT}`);
		console.log(`📊 Dashboard: http://localhost:${PORT}`);
	});
}

