const API_BASE = '/api';

// Player authentication
let playerAuthToken = localStorage.getItem('playerAuthToken');
let playerInfo = null;

// Admin mode check
function isAdminMode() {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get('adm') === 'kawe';
}

// Login function
async function loginPlayer(authCode) {
	try {
		const res = await fetch(`${API_BASE}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: authCode })
		});
		
		const data = await res.json();
		if (data.success) {
			playerAuthToken = authCode;
			playerInfo = {
				steamId: data.steamId,
				playerName: data.playerName
			};
			localStorage.setItem('playerAuthToken', authCode);
			return true;
		}
		return false;
	} catch (error) {
		console.error('Login error:', error);
		return false;
	}
}

// Logout function
function logoutPlayer() {
	playerAuthToken = null;
	playerInfo = null;
	localStorage.removeItem('playerAuthToken');
	showPage('login', null);
}

// Check if player is logged in
function isPlayerLoggedIn() {
	return playerAuthToken !== null;
}

// Initialize admin mode visibility
function initAdminMode() {
	const adminOnlyElements = document.querySelectorAll('.admin-only');
	if (isAdminMode()) {
		adminOnlyElements.forEach(el => el.style.display = '');
	} else {
		adminOnlyElements.forEach(el => el.style.display = 'none');
	}
}

// Navigation
function showPage(page, btn) {
	document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
	document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
	
	// Check if login required for player pages
	if (page === 'my-quests' && !isPlayerLoggedIn() && !isAdminMode()) {
		showPage('login', null);
		return;
	}
	
	document.getElementById(`${page}-page`).classList.remove('hidden');
	if (btn) {
		btn.classList.add('active');
	}
	
	if (page === 'dashboard') loadDashboard();
	else if (page === 'factions') loadFactions();
	else if (page === 'quests') loadQuests();
	else if (page === 'shop') loadShopItems();
	else if (page === 'players') loadPlayers();
	else if (page === 'my-quests') loadMyQuests();
	else if (page === 'commands') loadCommands();
	else if (page === 'login') {
		// Login page doesn't need to load anything
	}
}

// Dashboard
async function loadDashboard() {
	try {
		const res = await fetch(`${API_BASE}/dashboard/stats`);
		const stats = await res.json();
		
		document.getElementById('stat-factions').textContent = stats.totalFactions || 0;
		document.getElementById('stat-quests').textContent = stats.totalQuests || 0;
		document.getElementById('stat-players').textContent = stats.totalPlayers || 0;
		document.getElementById('stat-active').textContent = stats.activeQuests || 0;
		
		document.getElementById('recent-activity').innerHTML = `
			<div class="space-y-2">
				<div class="flex items-center justify-between py-2 border-b border-gray-200">
					<span class="text-sm text-gray-600">${stats.totalFactions} factions</span>
					<span class="text-xs text-gray-400">now</span>
				</div>
				<div class="flex items-center justify-between py-2 border-b border-gray-200">
					<span class="text-sm text-gray-600">${stats.totalQuests} quests</span>
					<span class="text-xs text-gray-400">now</span>
				</div>
				<div class="flex items-center justify-between py-2">
					<span class="text-sm text-gray-600">${stats.totalPlayers} players</span>
					<span class="text-xs text-gray-400">now</span>
				</div>
			</div>
		`;
	} catch (error) {
		console.error('Failed to load dashboard:', error);
	}
}

// Factions
async function loadFactions() {
	try {
		const res = await fetch(`${API_BASE}/factions`);
		const factions = await res.json();
		
		if (!factions || factions.length === 0) {
			document.getElementById('factions-list').innerHTML = '<div class="text-center text-sm text-gray-500 py-12">No factions found</div>';
			return;
		}

		const html = factions.map(f => {
			const factionName = f.name || f.id || 'Unknown';
			const factionTag = f.tag || '';
			const factionColor = f.color || '#6366f1';
			const memberCount = f.member_count || 0;
			const points = f.faction_points || 0;
			const tier = f.tier || 1;
			const iconUrl = f.icon_url || '';
			const initial = factionName.charAt(0).toUpperCase();
			
			return `
			<div class="p-5 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer" onclick="viewFaction('${f.id}')">
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1">
						<div class="flex items-center gap-3 mb-3">
							${iconUrl ? `<img src="${iconUrl}" alt="${factionName}" class="w-12 h-12 rounded-lg object-cover border-2" style="border-color: ${factionColor};" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
							<div class="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold text-white" style="background: ${factionColor}; ${iconUrl ? 'display: none;' : ''}">
								${initial}
							</div>
							<div class="flex-1">
								<div class="flex items-center gap-2 mb-1">
									<h4 class="text-base font-bold text-gray-900">${escapeHtml(factionName)}</h4>
									${factionTag ? `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">${escapeHtml(factionTag)}</span>` : ''}
								</div>
								<p class="text-xs text-gray-500">
									${memberCount} member${memberCount !== 1 ? 's' : ''} • Tier ${tier}
								</p>
							</div>
						</div>
						<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
							<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
								<div class="text-xs font-medium text-blue-700 mb-1">Faction Points</div>
								<div class="text-lg font-bold text-blue-900">${points.toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 border border-purple-200">
								<div class="text-xs font-medium text-purple-700 mb-1">Faction XP</div>
								<div class="text-lg font-bold text-purple-900">${(f.faction_xp || 0).toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-3 border border-indigo-200">
								<div class="text-xs font-medium text-indigo-700 mb-1">Tier</div>
								<div class="text-lg font-bold text-indigo-900">${tier}</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`}).join('');
		
		document.getElementById('factions-list').innerHTML = html || '<div class="text-center text-sm text-gray-500 py-12">No factions found</div>';
	} catch (error) {
		console.error('Failed to load factions:', error);
		document.getElementById('factions-list').innerHTML = '<div class="text-center text-sm text-red-500 py-12">Failed to load factions</div>';
	}
}

function refreshFactions() {
	loadFactions();
}

async function viewFaction(id) {
	try {
		const res = await fetch(`${API_BASE}/factions/${id}`);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: ${res.statusText}`);
		}
		const faction = await res.json();
		
		if (!faction) {
			alert('Faction not found');
			return;
		}
		
		// Handle members - could be array or object
		let members = [];
		if (Array.isArray(faction.members)) {
			members = faction.members;
		} else if (faction.members && typeof faction.members === 'object') {
			// Convert object to array
			members = Object.values(faction.members);
		}
		
		const invitations = faction.invitations || [];
		const factionName = faction.name || id;
		const factionTag = faction.tag || '';
		const factionColor = faction.color || '#6366f1';
		const leaderId = faction.leader_id || null;
		const points = faction.faction_points || 0;
		const xp = faction.faction_xp || 0;
		const tier = faction.tier || 1;
		const iconUrl = faction.icon_url || '';
		
		// Leader name
		const leaderName = leaderId ? `Steam ID: ${leaderId}` : 'Unknown';
		
		// Create modal HTML
		const modalHTML = `
			<div id="faction-detail-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onclick="closeFactionDetail()">
				<div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
					<!-- Header -->
					<div class="relative p-6 border-b border-gray-200" style="background: linear-gradient(135deg, ${factionColor}15 0%, ${factionColor}05 100%);">
						<div class="flex items-start justify-between">
							<div class="flex items-center gap-4 flex-1">
								${iconUrl ? `<img src="${iconUrl}" alt="${factionName}" class="w-16 h-16 rounded-lg object-cover border-2" style="border-color: ${factionColor};" onerror="this.style.display='none'">` : `<div class="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white" style="background: ${factionColor};">${factionName.charAt(0).toUpperCase()}</div>`}
								<div class="flex-1">
									<div class="flex items-center gap-2 mb-1">
										<h2 class="text-2xl font-bold text-gray-900">${escapeHtml(factionName)}</h2>
										${factionTag ? `<span class="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">${escapeHtml(factionTag)}</span>` : ''}
									</div>
									<div class="flex items-center gap-2">
										<div class="w-4 h-4 rounded-full border-2 border-gray-300" style="background-color: ${factionColor};"></div>
										<span class="text-sm text-gray-600">${factionColor}</span>
									</div>
								</div>
							</div>
							<button onclick="closeFactionDetail()" class="text-gray-400 hover:text-gray-600 transition">
								<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
								</svg>
							</button>
						</div>
					</div>
					
					<!-- Content -->
					<div class="p-6 space-y-6">
						<!-- Stats Grid -->
						<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
							<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
								<div class="text-xs font-medium text-blue-700 mb-1">Faction Points</div>
								<div class="text-2xl font-bold text-blue-900">${points.toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
								<div class="text-xs font-medium text-purple-700 mb-1">Faction XP</div>
								<div class="text-2xl font-bold text-purple-900">${xp.toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
								<div class="text-xs font-medium text-indigo-700 mb-1">Tier</div>
								<div class="text-2xl font-bold text-indigo-900">${tier}</div>
							</div>
							<div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
								<div class="text-xs font-medium text-green-700 mb-1">Total Completed</div>
								<div class="text-2xl font-bold text-green-900">${Object.values(faction.completed_quests_by_tier || {}).reduce((a, b) => a + b, 0).toLocaleString()}</div>
								${faction.total_quests > 0 ? `<div class="text-xs text-green-600 mt-1">of ${faction.total_quests} total</div>` : ''}
							</div>
						</div>
						
						<!-- Leader -->
						<div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
							<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Leader</div>
							<div class="flex items-center gap-2">
								<div class="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">👑</div>
								<span class="text-sm font-medium text-gray-900">${escapeHtml(leaderName)}</span>
							</div>
						</div>
						
						<!-- Members -->
						<div>
							<div class="flex items-center justify-between mb-3">
								<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Members (${members.length})</div>
							</div>
							${members.length > 0 ? `
								<div class="space-y-2">
									${members.map((member, idx) => {
										// Handle both object and primitive types
										const memberId = typeof member === 'object' && member !== null ? (member.player_id || member.id || JSON.stringify(member)) : member;
										const isLeader = memberId == leaderId; // Use == for type coercion
										return `
											<div class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition">
												<div class="w-10 h-10 rounded-full bg-gradient-to-br ${isLeader ? 'from-yellow-400 to-orange-500' : 'from-gray-300 to-gray-400'} flex items-center justify-center text-white font-semibold text-sm">
													${isLeader ? '👑' : (idx + 1)}
												</div>
												<div class="flex-1">
													<div class="text-sm font-medium text-gray-900">Steam ID: ${memberId}</div>
													${isLeader ? '<div class="text-xs text-yellow-600 font-medium">Leader</div>' : ''}
												</div>
											</div>
										`;
									}).join('')}
								</div>
							` : `
								<div class="text-center py-8 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
									No members yet
								</div>
							`}
						</div>
						
						<!-- Completed Quests by Tier -->
						<div>
							<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Completed Quests by Tier</div>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
								${[1, 2, 3, 4, 5].map(tier => {
									const count = (faction.completed_quests_by_tier && faction.completed_quests_by_tier[tier]) ? faction.completed_quests_by_tier[tier] : 0;
									return `
										<div class="p-3 bg-white border border-gray-200 rounded-lg ${count === 0 ? 'opacity-60' : ''}">
											<div class="flex items-center justify-between">
												<div class="flex items-center gap-2">
													<span class="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">Tier ${tier}</span>
													<span class="text-sm font-medium text-gray-700">Completed:</span>
												</div>
												<span class="text-lg font-bold ${count === 0 ? 'text-gray-400' : 'text-gray-900'}">${count.toLocaleString()}</span>
											</div>
										</div>
									`;
								}).join('')}
							</div>
						</div>
						
						<!-- Invitations -->
						${invitations.length > 0 ? `
							<div>
								<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending Invitations (${invitations.length})</div>
								<div class="space-y-2">
									${invitations.map(inv => `
										<div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
											<div class="text-sm text-gray-700">Steam ID: ${inv.invited_player_id || 'Unknown'}</div>
											<div class="text-xs text-gray-500 mt-1">Invited by: ${inv.inviter_id || 'Unknown'}</div>
										</div>
									`).join('')}
								</div>
							</div>
						` : ''}
					</div>
					
					<!-- Footer -->
					<div class="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
						<button onclick="closeFactionDetail()" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
							Close
						</button>
					</div>
				</div>
			</div>
		`;
		
		// Remove existing modal if any
		const existingModal = document.getElementById('faction-detail-modal');
		if (existingModal) {
			existingModal.remove();
		}
		
		// Add modal to body
		document.body.insertAdjacentHTML('beforeend', modalHTML);
	} catch (error) {
		console.error('Failed to load faction:', error);
		alert(`Failed to load faction: ${error.message}`);
	}
}

function closeFactionDetail() {
	const modal = document.getElementById('faction-detail-modal');
	if (modal) {
		modal.remove();
	}
}

// Quests
let allQuests = []; // Store all quests for filtering

async function loadQuests() {
	try {
		const res = await fetch(`${API_BASE}/quests`);
		allQuests = await res.json();
		
		filterQuests();
	} catch (error) {
		console.error('Failed to load quests:', error);
		document.getElementById('quests-list').innerHTML = '<div class="text-center text-sm text-red-500 py-12">Failed to load quests</div>';
	}
}

function filterQuests() {
	const searchText = (document.getElementById('quest-search')?.value || '').toLowerCase();
	const factionFilter = document.getElementById('quest-faction-filter')?.value || 'all';
	const typeFilter = document.getElementById('quest-type-filter')?.value || 'all';
	
	const filtered = allQuests.filter(q => {
		// Search filter
		const matchesSearch = !searchText || 
			(q.id?.toLowerCase().includes(searchText) || 
			 q.display_name?.toLowerCase().includes(searchText) ||
			 q.description?.toLowerCase().includes(searchText));
		
		// Faction filter
		let matchesFaction = true;
		if (factionFilter === 'faction') {
			matchesFaction = q.is_faction_quest === true;
		} else if (factionFilter === 'non-faction') {
			matchesFaction = q.is_faction_quest !== true;
		}
		
		// Type filter
		let matchesType = true;
		if (typeFilter !== 'all') {
			// Normalize quest_type: handle null, undefined, empty string, or whitespace
			// Backend already normalizes, but double-check here for safety
			let questType = (q.quest_type || '').toString().trim().toLowerCase();
			if (!questType || questType === '') {
				questType = 'repeat'; // Default to repeat if empty/null
			}
			const filterType = typeFilter.toLowerCase();
			matchesType = questType === filterType;
		}
		
		return matchesSearch && matchesFaction && matchesType;
	});
	
	renderQuests(filtered);
}

function formatTimer(seconds) {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatPlaytime(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

function renderQuests(quests) {
	if (quests.length === 0) {
		document.getElementById('quests-list').innerHTML = '<div class="text-center text-sm text-gray-500 py-12">No quests found</div>';
		return;
	}
	
	const html = quests.map(q => {
		const questType = (q.quest_type || 'repeat').toLowerCase();
		const questTypeColors = {
			daily: 'bg-blue-100 text-blue-700',
			weekly: 'bg-purple-100 text-purple-700',
			monthly: 'bg-orange-100 text-orange-700',
			repeat: 'bg-gray-100 text-gray-700'
		};
		const typeColor = questTypeColors[questType] || questTypeColors.repeat;
		
		return `
			<div class="p-5 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer" onclick="showQuestEditor('${q.id}')">
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1">
						<div class="flex items-center gap-2 mb-2">
							<div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">📜</div>
							<div class="flex-1">
								<h4 class="text-base font-bold text-gray-900 mb-1">${escapeHtml(q.display_name || q.id)}</h4>
								<div class="flex items-center gap-2 flex-wrap">
									${q.is_faction_quest ? '<span class="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">Faction</span>' : ''}
									<span class="px-2.5 py-1 ${typeColor} text-xs font-semibold rounded-full">${questType.charAt(0).toUpperCase() + questType.slice(1)}</span>
									${q.enabled ? '<span class="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">✓ Enabled</span>' : '<span class="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">Disabled</span>'}
								</div>
							</div>
						</div>
						${q.description ? `<p class="text-sm text-gray-600 mb-3 ml-12">${escapeHtml(q.description)}</p>` : ''}
						<div class="ml-12 grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
							<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2 border border-blue-200">
								<div class="text-xs font-medium text-blue-700 mb-0.5">Objectives</div>
								<div class="text-sm font-bold text-blue-900">${q.objectives?.length || 0}</div>
							</div>
							<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-2 border border-gray-200">
								<div class="text-xs font-medium text-gray-700 mb-0.5">Quest ID</div>
								<div class="text-xs font-bold text-gray-900 truncate">${escapeHtml(q.id)}</div>
							</div>
							${q.is_faction_quest ? `
								<div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2 border border-orange-200">
									<div class="text-xs font-medium text-orange-700 mb-0.5">Timer</div>
									<div class="text-xs font-bold text-orange-900">${q.timer_seconds > 0 ? formatTimer(q.timer_seconds) : 'Default'}</div>
								</div>
							` : ''}
						</div>
						${q.rewards && q.rewards.length > 0 ? `
							<div class="ml-12 mb-3">
								<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rewards</div>
								<div class="flex flex-wrap gap-2">
									${q.rewards.map((reward) => {
										let rewardType = reward.Type || 'Unknown';
										const amount = reward.Amount || 0;
										const itemId = reward.ItemId || 0;
										const command = reward.Command || '';
										
										// Handle numeric enum values (0=None, 1=PlayerXP, 2=Item, 3=Command, 4=FactionPoints, 5=FactionXP)
										if (typeof rewardType === 'number') {
											const rewardTypeMap = {
												0: 'None',
												1: 'PlayerXP',
												2: 'Item',
												3: 'Command',
												4: 'FactionPoints',
												5: 'FactionXP'
											};
											rewardType = rewardTypeMap[rewardType] || 'Unknown';
										}
										
										// Convert to string for comparison
										const typeStr = String(rewardType).toLowerCase();
										
										// Format reward display dengan amount yang jelas
										let rewardDisplay = '';
										if (typeStr === 'playerxp' || typeStr === 'factionxp' || typeStr === 'xp') {
											rewardDisplay = amount > 0 ? `XP ${amount.toLocaleString()}` : 'XP';
										} else if (typeStr === 'item') {
											if (itemId > 0) {
												rewardDisplay = amount > 0 ? `Item(${itemId}) ${amount}x` : `Item(${itemId})`;
											} else {
												rewardDisplay = amount > 0 ? `Item ${amount.toLocaleString()}` : 'Item';
											}
										} else if (typeStr === 'command') {
											// Check if command is Uconomy related
											if (command && (command.toLowerCase().includes('uconomy') || command.toLowerCase().includes('balance') || command.toLowerCase().includes('pay'))) {
												rewardDisplay = amount > 0 ? `Uconomy ${amount.toLocaleString()}` : 'Uconomy';
											} else {
												rewardDisplay = command ? `Command: ${command.substring(0, 20)}${command.length > 20 ? '...' : ''}` : 'Command';
											}
										} else if (typeStr === 'factionpoints') {
											rewardDisplay = amount > 0 ? `Faction Points ${amount.toLocaleString()}` : 'Faction Points';
										} else {
											// Fallback: show type and amount
											rewardDisplay = amount > 0 ? `${rewardType} ${amount.toLocaleString()}` : rewardType;
										}
										
										return `
											<span class="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full border border-purple-200">
												${escapeHtml(rewardDisplay)}
											</span>
										`;
									}).join('')}
								</div>
							</div>
						` : ''}
						${(q.objectives && q.objectives.length > 0) || (q.rewards && q.rewards.length > 0) ? `
							<div class="ml-12 grid grid-cols-1 md:grid-cols-2 gap-4">
								${q.objectives && q.objectives.length > 0 ? `
									<div>
										<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Objectives</div>
										<div class="space-y-2">
											${q.objectives.map((obj, idx) => {
												const objName = obj.ObjectiveName || obj.Id || `Objective ${idx + 1}`;
												const targetValue = obj.TargetValue || 0;
												return `
													<div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
														<div class="flex items-center justify-between">
															<div class="text-xs font-semibold text-blue-900">${escapeHtml(objName)}</div>
															<div class="text-xs font-bold text-blue-900 bg-blue-100 px-2 py-1 rounded">${targetValue}</div>
														</div>
													</div>
												`;
											}).join('')}
										</div>
									</div>
								` : ''}
								${q.rewards && q.rewards.length > 0 ? `
									<div>
										<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rewards</div>
										<div class="space-y-2">
											${q.rewards.map((reward, idx) => {
												let rewardType = reward.Type || 'Unknown';
												const amount = reward.Amount || 0;
												const itemId = reward.ItemId || 0;
												const command = reward.Command || '';
												
												// Handle numeric enum values
												if (typeof rewardType === 'number') {
													const rewardTypeMap = {
														0: 'None',
														1: 'PlayerXP',
														2: 'Item',
														3: 'Command',
														4: 'FactionPoints',
														5: 'FactionXP'
													};
													rewardType = rewardTypeMap[rewardType] || 'Unknown';
												}
												
												const typeStr = String(rewardType).toLowerCase();
												
												// Format reward display dengan amount yang jelas
												let rewardDisplay = '';
												if (typeStr === 'playerxp' || typeStr === 'factionxp' || typeStr === 'xp') {
													rewardDisplay = amount > 0 ? `XP ${amount.toLocaleString()}` : 'XP';
												} else if (typeStr === 'item') {
													if (itemId > 0) {
														rewardDisplay = amount > 0 ? `Item(${itemId}) ${amount}x` : `Item(${itemId})`;
													} else {
														rewardDisplay = amount > 0 ? `Item ${amount.toLocaleString()}` : 'Item';
													}
												} else if (typeStr === 'command') {
													// Check if command is Uconomy related
													if (command && (command.toLowerCase().includes('uconomy') || command.toLowerCase().includes('balance') || command.toLowerCase().includes('pay'))) {
														rewardDisplay = amount > 0 ? `Uconomy ${amount.toLocaleString()}` : 'Uconomy';
													} else {
														rewardDisplay = command ? `Command: ${command.substring(0, 30)}${command.length > 30 ? '...' : ''}` : 'Command';
													}
												} else if (typeStr === 'factionpoints') {
													rewardDisplay = amount > 0 ? `Faction Points ${amount.toLocaleString()}` : 'Faction Points';
												} else {
													rewardDisplay = amount > 0 ? `${rewardType} ${amount.toLocaleString()}` : rewardType;
												}
												
												return `
													<div class="bg-purple-50 border border-purple-200 rounded-lg p-3">
														<div class="text-xs font-semibold text-purple-900">${escapeHtml(rewardDisplay)}</div>
													</div>
												`;
											}).join('')}
										</div>
									</div>
								` : ''}
							</div>
						` : ''}
					</div>
					<button onclick="event.stopPropagation(); showQuestEditor('${q.id}')" class="admin-only btn-primary px-4 py-2 text-sm font-medium rounded-lg flex-shrink-0">Edit</button>
				</div>
			</div>
		`;
	}).join('');
	
	document.getElementById('quests-list').innerHTML = html;
	// Re-apply admin mode visibility after rendering
	initAdminMode();
}

// Form builder counters
let objectiveCounter = 0;
let rewardCounter = 0;

async function showQuestEditor(questId) {
	// Check admin mode before allowing edit
	if (!isAdminMode()) {
		return;
	}
	
	const modal = document.getElementById('quest-modal');
	modal.classList.remove('hidden');
	
	// Update modal title
	const titleEl = document.getElementById('quest-modal-title');
	if (titleEl) {
		titleEl.textContent = questId ? 'Edit Quest' : 'New Quest';
	}
	
	// Reset form builders
	objectiveCounter = 0;
	rewardCounter = 0;
	document.getElementById('objectives-form-container').innerHTML = '';
	document.getElementById('rewards-form-container').innerHTML = '';
	document.getElementById('objectives-json-preview').classList.add('hidden');
	document.getElementById('rewards-json-preview').classList.add('hidden');
	
	if (questId) {
		// Edit mode
		try {
			const res = await fetch(`${API_BASE}/quests/${questId}`);
			const quest = await res.json();
			
			document.getElementById('quest-id').value = quest.id;
			document.getElementById('quest-id').readOnly = true;
			document.getElementById('quest-name').value = quest.display_name || '';
			document.getElementById('quest-desc').value = quest.description || '';
			document.getElementById('quest-enabled').checked = quest.enabled !== false;
			document.getElementById('quest-faction').checked = quest.is_faction_quest || false;
			document.getElementById('quest-type').value = quest.quest_type || 'repeat';
			document.getElementById('quest-tier').value = quest.tier || 1;
			document.getElementById('quest-timer-seconds').value = quest.timer_seconds || 0;
			
			// Populate objectives form
			if (quest.objectives && quest.objectives.length > 0) {
				quest.objectives.forEach((obj, idx) => {
					addObjectiveForm(obj, idx);
				});
			} else {
				addObjective();
			}
			
			// Populate rewards form
			if (quest.rewards && quest.rewards.length > 0) {
				quest.rewards.forEach((reward, idx) => {
					// Convert old "XP" to "PlayerXP" for backward compatibility
					if (reward.Type === 'XP') {
						reward.Type = 'PlayerXP';
					}
					addRewardForm(reward, idx);
				});
			} else {
				addReward();
			}
		} catch (error) {
			console.error('Failed to load quest:', error);
		}
	} else {
		// New quest mode - auto-generate ID
		document.getElementById('quest-form').reset();
		document.getElementById('quest-id').readOnly = true;
		
		try {
			const res = await fetch(`${API_BASE}/quests/next-id`);
			const data = await res.json();
			document.getElementById('quest-id').value = data.nextId;
		} catch (error) {
			console.error('Failed to get next ID:', error);
			document.getElementById('quest-id').value = 'QMG-001';
		}
		
		// Add default objective and reward
		addObjective();
		addReward();
	}
}

function closeQuestEditor() {
	document.getElementById('quest-modal').classList.add('hidden');
	objectiveCounter = 0;
	rewardCounter = 0;
}

// Helper functions for Parameter1 help content
function getParameter1HelpContent(type) {
	const helpContents = {
		'Zombie': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for Zombie:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li><strong>0</strong> or <strong>*</strong> or <strong>empty</strong> - Any zombie</li>
					<li><strong>Zombie ID</strong> - Specific zombie type (not commonly used)</li>
				</ul>
				<p class="text-gray-500 mt-2 text-xs">Note: Parameter 1 is optional for Zombie type. Leave empty to count all zombies.</p>
			</div>
		`,
		'SpecificZombie': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for SpecificZombie:</p>
				<p class="text-gray-600">Parameter 1 is <strong>NOT used</strong> for SpecificZombie type.</p>
				<p class="font-semibold text-gray-900 mt-2 mb-1">Use Parameter 2 instead:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li>Format: <code class="bg-gray-100 px-1 rounded">SPECIALITY|radiated</code></li>
					<li>Example: <code class="bg-gray-100 px-1 rounded">MEGA|normal</code></li>
					<li>Example: <code class="bg-gray-100 px-1 rounded">BURNER|radiated</code></li>
				</ul>
				<p class="font-semibold text-gray-900 mt-2 mb-1">Available Specialities:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600 text-xs">
					<li><strong>NORMAL</strong> - Regular zombie</li>
					<li><strong>MEGA</strong> - Mega zombie (boss)</li>
					<li><strong>BURNER</strong> - Fire zombie</li>
					<li><strong>SPRINT</strong> - Fast zombie</li>
					<li><strong>FLANKER_FRIENDLY</strong> - Friendly flanker</li>
					<li><strong>FLANKER_STALKER</strong> - Stalker flanker</li>
					<li><strong>FLANKER</strong> - Flanker zombie</li>
					<li><strong>ACID</strong> - Acid zombie</li>
					<li><strong>ELECTRIC</strong> - Electric zombie</li>
				</ul>
				<p class="text-gray-500 mt-2 text-xs">Radiated: <code class="bg-gray-100 px-1 rounded">radiated</code> or <code class="bg-gray-100 px-1 rounded">normal</code></p>
			</div>
		`,
		'BOSS_ALL': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for BOSS_ALL:</p>
				<p class="text-gray-600 mb-2">Must be exactly: <code class="bg-gray-100 px-1 rounded font-mono">BOSS_ALL</code></p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li>This objective type <strong>only counts MEGA zombies</strong></li>
					<li>Regular zombies (NORMAL, BURNER, SPRINT, etc.) will <strong>NOT</strong> be counted</li>
					<li>Parameter 2 and Parameter 3 are optional</li>
				</ul>
				<p class="text-yellow-600 mt-2 text-xs font-semibold">⚠️ Important: Only MEGA zombie kills will count towards this objective!</p>
			</div>
		`,
		'ItemAmount': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for ItemAmount:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li><strong>Item ID</strong> - The ID of the item to collect</li>
					<li>Example: <code class="bg-gray-100 px-1 rounded">123</code> for item ID 123</li>
				</ul>
				<p class="text-gray-500 mt-2 text-xs">Leave empty or use <strong>0</strong> or <strong>*</strong> to count any item.</p>
			</div>
		`,
		'Animal': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for Animal:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li><strong>0</strong> or <strong>*</strong> or <strong>empty</strong> - Any animal</li>
					<li><strong>Animal ID</strong> - Specific animal type</li>
				</ul>
			</div>
		`,
		'Craft': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for Craft:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li><strong>Item ID</strong> - The ID of the item to craft</li>
					<li>Example: <code class="bg-gray-100 px-1 rounded">456</code> for item ID 456</li>
				</ul>
			</div>
		`,
		'Playtime': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for Playtime:</p>
				<p class="text-gray-600">Parameter 1 is <strong>NOT used</strong> for Playtime type.</p>
				<p class="text-gray-500 mt-2 text-xs">Playtime is measured in minutes based on Target Value.</p>
			</div>
		`,
		'Fishing': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for Fishing:</p>
				<ul class="list-disc list-inside space-y-0.5 text-gray-600">
					<li><strong>0</strong> or <strong>*</strong> or <strong>empty</strong> - Any fish</li>
					<li><strong>Item ID</strong> - Specific fish/item ID</li>
				</ul>
			</div>
		`,
		'Manual': `
			<div class="text-xs space-y-2">
				<p class="font-semibold text-gray-900 mb-1">Parameter 1 for Manual:</p>
				<p class="text-gray-600">Parameter 1 is <strong>NOT used</strong> for Manual type.</p>
				<p class="text-gray-500 mt-2 text-xs">Manual objectives require admin command to complete.</p>
			</div>
		`
	};
	return helpContents[type] || helpContents['Zombie'];
}

function getParameter1Placeholder(type) {
	const placeholders = {
		'Zombie': 'Leave empty or 0 for any zombie',
		'SpecificZombie': 'Not used (use Parameter 2)',
		'BOSS_ALL': 'BOSS_ALL (exact match required)',
		'ItemAmount': 'Item ID (e.g., 123)',
		'Animal': 'Animal ID or leave empty',
		'Craft': 'Item ID to craft',
		'Playtime': 'Not used',
		'Fishing': 'Fish/Item ID or leave empty',
		'Manual': 'Not used'
	};
	return placeholders[type] || 'Item/Zombie ID';
}

function updateObjectiveHelp(index) {
	const objectiveItem = document.querySelector(`.objective-item[data-index="${index}"]`);
	if (!objectiveItem) return;
	
	const typeSelect = objectiveItem.querySelector('[data-field="Type"]');
	const helpContent = objectiveItem.querySelector(`#param1-help-content-${index}`);
	const param1Input = objectiveItem.querySelector('[data-field="Parameter1"]');
	
	if (!typeSelect || !helpContent || !param1Input) return;
	
	const selectedType = typeSelect.value;
	helpContent.innerHTML = getParameter1HelpContent(selectedType);
	param1Input.placeholder = getParameter1Placeholder(selectedType);
}

// Objective form builder
function addObjective(data = null) {
	const index = objectiveCounter++;
	const questId = document.getElementById('quest-id').value || 'QMG-001';
	const defaultData = {
		Id: `${questId}-OBJ-${String(index + 1).padStart(2, '0')}`,
		Type: 'Zombie',
		TargetValue: 1,
		Parameter1: '',
		Parameter2: '',
		Parameter3: '',
		ObjectiveName: ''
	};
	addObjectiveForm(data || defaultData, index);
	updateJsonPreview('objectives');
}

function addObjectiveForm(data, index) {
	const container = document.getElementById('objectives-form-container');
	const div = document.createElement('div');
	div.className = 'objective-item border border-gray-200 rounded-lg p-4 bg-white';
	div.dataset.index = index;
	
	div.innerHTML = `
		<div class="flex justify-between items-center mb-3">
			<span class="text-sm font-medium text-gray-700">Objective #${index + 1}</span>
			<button type="button" onclick="removeObjective(${index})" class="text-sm text-red-600 hover:text-red-700 font-medium">Remove</button>
		</div>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">ID</label>
				<input type="text" data-field="Id" value="${escapeHtml(data.Id || '')}" readonly class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed">
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
				<input type="text" data-field="ObjectiveName" value="${escapeHtml(data.ObjectiveName || '')}" placeholder="Objective name" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('objectives')">
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
				<select data-field="Type" required class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateObjectiveHelp(${index}); updateJsonPreview('objectives')">
					<option value="Zombie" ${data.Type === 'Zombie' ? 'selected' : ''}>Zombie</option>
					<option value="Animal" ${data.Type === 'Animal' ? 'selected' : ''}>Animal</option>
					<option value="SpecificZombie" ${data.Type === 'SpecificZombie' ? 'selected' : ''}>Specific Zombie</option>
					<option value="BOSS_ALL" ${data.Type === 'BOSS_ALL' ? 'selected' : ''}>BOSS_ALL (MEGA Only)</option>
					<option value="ItemAmount" ${data.Type === 'ItemAmount' ? 'selected' : ''}>Item Amount</option>
					<option value="Craft" ${data.Type === 'Craft' ? 'selected' : ''}>Craft</option>
					<option value="Playtime" ${data.Type === 'Playtime' ? 'selected' : ''}>Playtime</option>
					<option value="Fishing" ${data.Type === 'Fishing' ? 'selected' : ''}>Fishing</option>
					<option value="Manual" ${data.Type === 'Manual' ? 'selected' : ''}>Manual</option>
				</select>
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
				<input type="number" data-field="TargetValue" value="${data.TargetValue || 1}" min="1" required class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('objectives')">
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
					Param 1
					<div class="dropdown relative inline-block" id="param1-help-${index}">
						<button type="button" class="w-4 h-4 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs" onclick="event.preventDefault(); toggleDropdown('param1-help-${index}')" title="Click for help">
							?
						</button>
						<div class="dropdown-content" id="param1-help-content-${index}">
							${getParameter1HelpContent(data.Type || 'Zombie')}
						</div>
					</div>
				</label>
				<input type="text" data-field="Parameter1" value="${escapeHtml(data.Parameter1 || '')}" placeholder="${getParameter1Placeholder(data.Type || 'Zombie')}" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('objectives')">
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Param 2</label>
				<input type="text" data-field="Parameter2" value="${escapeHtml(data.Parameter2 || '')}" placeholder="Speciality|radiated" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('objectives')">
			</div>
			<div class="md:col-span-2">
				<label class="block text-sm font-medium text-gray-700 mb-1">Param 3 (Location)</label>
				<input type="text" data-field="Parameter3" value="${escapeHtml(data.Parameter3 || '')}" placeholder="Location (optional)" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('objectives')">
			</div>
		</div>
	`;
	
	container.appendChild(div);
}

function toggleDropdown(id) {
	const dropdown = document.getElementById(id);
	dropdown.classList.toggle('open');
	// Close when clicking outside
	document.addEventListener('click', function closeDropdown(e) {
		if (!dropdown.contains(e.target)) {
			dropdown.classList.remove('open');
			document.removeEventListener('click', closeDropdown);
		}
	});
}

function removeObjective(index) {
	const item = document.querySelector(`.objective-item[data-index="${index}"]`);
	if (item) {
		item.remove();
		updateJsonPreview('objectives');
	}
}

// Reward form builder
function addReward(data = null) {
	const index = rewardCounter++;
	const defaultData = {
		Type: 'PlayerXP',
		Amount: 100,
		ItemId: 0,
		Command: ''
	};
	addRewardForm(data || defaultData, index);
	updateJsonPreview('rewards');
}

function addRewardForm(data, index) {
	const container = document.getElementById('rewards-form-container');
	const div = document.createElement('div');
	div.className = 'reward-item border border-gray-200 rounded-lg p-4 bg-white';
	div.dataset.index = index;
	
	div.innerHTML = `
		<div class="flex justify-between items-center mb-3">
			<span class="text-sm font-medium text-gray-700">Reward #${index + 1}</span>
			<button type="button" onclick="removeReward(${index})" class="text-sm text-red-600 hover:text-red-700 font-medium">Remove</button>
		</div>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
				<select data-field="Type" required class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateRewardFields(${index}); updateJsonPreview('rewards')">
					<option value="PlayerXP" ${(data.Type === 'PlayerXP' || data.Type === 'XP') ? 'selected' : ''}>Player XP</option>
					<option value="Item" ${data.Type === 'Item' ? 'selected' : ''}>Item</option>
					<option value="Command" ${data.Type === 'Command' ? 'selected' : ''}>Command</option>
					<option value="FactionPoints" ${data.Type === 'FactionPoints' ? 'selected' : ''}>Faction Points</option>
					<option value="FactionXP" ${data.Type === 'FactionXP' ? 'selected' : ''}>Faction XP</option>
				</select>
			</div>
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
				<input type="number" data-field="Amount" value="${data.Amount || 0}" min="0" required class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('rewards')">
			</div>
			<div id="reward-itemid-${index}" class="${data.Type === 'Item' ? '' : 'hidden'}">
				<label class="block text-sm font-medium text-gray-700 mb-1">Item ID</label>
				<input type="number" data-field="ItemId" value="${data.ItemId || 0}" min="0" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('rewards')">
			</div>
			<div id="reward-command-${index}" class="${data.Type === 'Command' ? '' : 'hidden'} md:col-span-2">
				<label class="block text-sm font-medium text-gray-700 mb-1">Command</label>
				<input type="text" data-field="Command" value="${escapeHtml(data.Command || '')}" placeholder="e.g., give {PlayerID} item 123" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateJsonPreview('rewards')">
			</div>
		</div>
	`;
	
	container.appendChild(div);
}

function removeReward(index) {
	const item = document.querySelector(`.reward-item[data-index="${index}"]`);
	if (item) {
		item.remove();
		updateJsonPreview('rewards');
	}
}

function updateRewardFields(index) {
	const item = document.querySelector(`.reward-item[data-index="${index}"]`);
	if (!item) return;
	
	const type = item.querySelector('[data-field="Type"]').value;
	const itemIdDiv = document.getElementById(`reward-itemid-${index}`);
	const commandDiv = document.getElementById(`reward-command-${index}`);
	
	if (itemIdDiv) itemIdDiv.classList.toggle('hidden', type !== 'Item');
	if (commandDiv) commandDiv.classList.toggle('hidden', type !== 'Command');
}

// Update JSON preview
function updateJsonPreview(type) {
	let items = [];
	const container = type === 'objectives' 
		? document.getElementById('objectives-form-container')
		: document.getElementById('rewards-form-container');
	
	const itemsList = container.querySelectorAll(`.${type === 'objectives' ? 'objective' : 'reward'}-item`);
	
	itemsList.forEach(item => {
		const itemData = {};
		const fields = item.querySelectorAll('[data-field]');
		
		fields.forEach(field => {
			const fieldName = field.dataset.field;
			if (field.type === 'number') {
				itemData[fieldName] = parseInt(field.value) || 0;
			} else {
				itemData[fieldName] = field.value || '';
			}
		});
		
		items.push(itemData);
	});
	
	const jsonTextarea = document.getElementById(`quest-${type}`);
	if (jsonTextarea) {
		jsonTextarea.value = JSON.stringify(items, null, 2);
	}
}

function toggleJsonPreview(type) {
	const preview = document.getElementById(`${type}-json-preview`);
	if (preview) {
		preview.classList.toggle('hidden');
		if (!preview.classList.contains('hidden')) {
			updateJsonPreview(type);
		}
	}
}

function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

async function saveQuest(event) {
	event.preventDefault();
	
	// Check admin mode before allowing save
	if (!isAdminMode()) {
		return;
	}
	
	// Collect objectives from form
	const objectives = [];
	const objectiveItems = document.querySelectorAll('#objectives-form-container .objective-item');
	objectiveItems.forEach(item => {
		const obj = {
			Id: item.querySelector('[data-field="Id"]').value,
			Type: item.querySelector('[data-field="Type"]').value,
			TargetValue: parseInt(item.querySelector('[data-field="TargetValue"]').value) || 1,
			Parameter1: item.querySelector('[data-field="Parameter1"]')?.value || '',
			Parameter2: item.querySelector('[data-field="Parameter2"]')?.value || '',
			Parameter3: item.querySelector('[data-field="Parameter3"]')?.value || '',
			ObjectiveName: item.querySelector('[data-field="ObjectiveName"]')?.value || ''
		};
		objectives.push(obj);
	});
	
	// Collect rewards from form
	const rewards = [];
	const rewardItems = document.querySelectorAll('#rewards-form-container .reward-item');
	rewardItems.forEach(item => {
		let rewardType = item.querySelector('[data-field="Type"]').value;
		// Convert old "XP" to "PlayerXP" for backward compatibility
		if (rewardType === 'XP') {
			rewardType = 'PlayerXP';
		}
		const reward = {
			Type: rewardType,
			Amount: parseInt(item.querySelector('[data-field="Amount"]').value) || 0,
			ItemId: parseInt(item.querySelector('[data-field="ItemId"]')?.value || 0) || 0,
			Command: item.querySelector('[data-field="Command"]')?.value || ''
		};
		rewards.push(reward);
	});
	
	const quest = {
		id: document.getElementById('quest-id').value,
		display_name: document.getElementById('quest-name').value,
		description: document.getElementById('quest-desc').value,
		enabled: document.getElementById('quest-enabled').checked,
		is_faction_quest: document.getElementById('quest-faction').checked,
		quest_type: document.getElementById('quest-type').value || 'repeat',
		tier: parseInt(document.getElementById('quest-tier').value) || 1,
		timer_seconds: parseInt(document.getElementById('quest-timer-seconds').value) || 0,
		objectives: objectives,
		rewards: rewards
	};
	
	try {
		const res = await fetch(`${API_BASE}/quests`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(quest)
		});
		
		const result = await res.json();
		if (result.success) {
			alert('Quest saved successfully!');
			closeQuestEditor();
			loadQuests();
		} else {
			alert('Failed to save quest: ' + (result.error || 'Unknown error'));
		}
	} catch (error) {
		console.error('Failed to save quest:', error);
		alert('Failed to save quest: ' + error.message);
	}
}

// Players
async function loadPlayers() {
	try {
		const res = await fetch(`${API_BASE}/players`);
		if (!res.ok) {
			const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
			throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
		}
		const players = await res.json();
		
		console.log('Players loaded:', players);
		console.log('Players count:', players ? players.length : 0);
		console.log('Players type:', Array.isArray(players) ? 'array' : typeof players);
		
		if (!players) {
			document.getElementById('players-list').innerHTML = '<div class="text-center text-sm text-red-500 py-12">Invalid response from server</div>';
			return;
		}
		
		if (!Array.isArray(players)) {
			console.error('Players is not an array:', players);
			document.getElementById('players-list').innerHTML = '<div class="text-center text-sm text-red-500 py-12">Invalid data format received</div>';
			return;
		}
		
		if (players.length === 0) {
			document.getElementById('players-list').innerHTML = '<div class="text-center text-sm text-gray-500 py-12">No players found in PlayerStatsNew table</div>';
			return;
		}
		
		const html = players.map(p => {
			const steamId = p.SteamId || p.steamId || 'N/A';
			const name = p.Name || p.name || 'Unknown';
			const kills = p.Kills || 0;
			const zombies = p.Zombies || 0;
			const animals = p.Animals || 0;
			const playtime = p.Playtime || 0;
			const playtimeHours = Math.floor(playtime / 3600);
			const playtimeMinutes = Math.floor((playtime % 3600) / 60);
			
			return `
			<div class="p-5 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all">
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1">
						<div class="flex items-center gap-3 mb-3">
							<div class="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-lg">
								${escapeHtml(name).charAt(0).toUpperCase()}
							</div>
							<div class="flex-1">
								<h4 class="text-base font-bold text-gray-900 mb-1">${escapeHtml(name)}</h4>
								<p class="text-xs text-gray-500 font-mono">Steam ID: ${steamId}</p>
							</div>
						</div>
						<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
							<div class="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 border border-red-200">
								<div class="text-xs font-medium text-red-700 mb-1">Kills</div>
								<div class="text-lg font-bold text-red-900">${kills.toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
								<div class="text-xs font-medium text-green-700 mb-1">Zombies</div>
								<div class="text-lg font-bold text-green-900">${zombies.toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-3 border border-yellow-200">
								<div class="text-xs font-medium text-yellow-700 mb-1">Animals</div>
								<div class="text-lg font-bold text-yellow-900">${animals.toLocaleString()}</div>
							</div>
							<div class="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-3 border border-indigo-200">
								<div class="text-xs font-medium text-indigo-700 mb-1">Playtime</div>
								<div class="text-sm font-bold text-indigo-900">${playtimeHours}h ${playtimeMinutes}m</div>
							</div>
						</div>
						${p.LastUpdated ? `<p class="text-xs text-gray-400 mt-3">Last Updated: ${new Date(p.LastUpdated).toLocaleString()}</p>` : ''}
					</div>
					<button onclick="viewPlayerStats('${steamId}')" class="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg hover:from-indigo-600 hover:to-purple-700 transition flex-shrink-0">
						Details
					</button>
				</div>
			</div>
		`;
		}).join('');
		
		document.getElementById('players-list').innerHTML = html;
	} catch (error) {
		console.error('Failed to load players:', error);
		document.getElementById('players-list').innerHTML = `<div class="text-center text-sm text-red-500 py-12">Failed to load players: ${error.message}</div>`;
	}
}

async function viewPlayerStats(playerId) {
	try {
		const res = await fetch(`${API_BASE}/players/${playerId}/stats`);
		const stats = await res.json();
		
		if (stats.error) {
			alert(`Error: ${stats.error}`);
			return;
		}
		
		const modal = document.createElement('div');
		modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
		modal.onclick = function(e) {
			if (e.target === modal) {
				modal.remove();
			}
		};
		const playerName = escapeHtml(stats.Name || playerId);
		const playerInitial = playerName.charAt(0).toUpperCase();
		modal.innerHTML = `
			<div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
				<!-- Header -->
				<div class="relative p-6 border-b border-gray-200" style="background: linear-gradient(135deg, #3b82f615 0%, #3b82f605 100%);">
					<div class="flex items-start justify-between">
						<div class="flex items-center gap-4 flex-1">
							<div class="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white bg-gradient-to-br from-blue-500 to-cyan-600">
								${playerInitial}
							</div>
							<div class="flex-1">
								<h2 class="text-2xl font-bold text-gray-900">${playerName}</h2>
								<p class="text-sm text-gray-600 mt-1">Player Statistics & Performance</p>
							</div>
						</div>
						<button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600 transition">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
						</button>
					</div>
				</div>
				<!-- Content -->
				<div class="p-6">
					<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
						<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
							<p class="text-xs font-medium text-gray-500 mb-1">Steam ID</p>
							<p class="text-sm font-semibold text-gray-900 font-mono">${stats.SteamId || playerId}</p>
						</div>
						<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
							<p class="text-xs font-medium text-blue-700 mb-1">Name</p>
							<p class="text-sm font-bold text-blue-900">${playerName}</p>
						</div>
						<div class="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
							<p class="text-xs font-medium text-red-700 mb-1">Kills</p>
							<p class="text-lg font-bold text-red-900">${(stats.Kills || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
							<p class="text-xs font-medium text-purple-700 mb-1">Headshots</p>
							<p class="text-lg font-bold text-purple-900">${(stats.Headshots || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
							<p class="text-xs font-medium text-orange-700 mb-1">PVP Deaths</p>
							<p class="text-lg font-bold text-orange-900">${(stats.PVPDeaths || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4 border border-pink-200">
							<p class="text-xs font-medium text-pink-700 mb-1">PVE Deaths</p>
							<p class="text-lg font-bold text-pink-900">${(stats.PVEDeaths || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
							<p class="text-xs font-medium text-green-700 mb-1">Zombies</p>
							<p class="text-lg font-bold text-green-900">${(stats.Zombies || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
							<p class="text-xs font-medium text-yellow-700 mb-1">Mega Zombies</p>
							<p class="text-lg font-bold text-yellow-900">${(stats.MegaZombies || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
							<p class="text-xs font-medium text-yellow-700 mb-1">Animals</p>
							<p class="text-lg font-bold text-yellow-900">${(stats.Animals || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
							<p class="text-xs font-medium text-teal-700 mb-1">Resources</p>
							<p class="text-lg font-bold text-teal-900">${(stats.Resources || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
							<p class="text-xs font-medium text-emerald-700 mb-1">Harvests</p>
							<p class="text-lg font-bold text-emerald-900">${(stats.Harvests || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 border border-cyan-200">
							<p class="text-xs font-medium text-cyan-700 mb-1">Fish</p>
							<p class="text-lg font-bold text-cyan-900">${(stats.Fish || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
							<p class="text-xs font-medium text-indigo-700 mb-1">Structures</p>
							<p class="text-lg font-bold text-indigo-900">${(stats.Structures || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200">
							<p class="text-xs font-medium text-slate-700 mb-1">Barricades</p>
							<p class="text-lg font-bold text-slate-900">${(stats.Barricades || 0).toLocaleString()}</p>
						</div>
						<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
							<p class="text-xs font-medium text-blue-700 mb-1">Playtime</p>
							<p class="text-sm font-bold text-blue-900">${formatPlaytime(stats.Playtime || 0)}</p>
						</div>
						<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
							<p class="text-xs font-medium text-gray-700 mb-1">UI Disabled</p>
							<p class="text-sm font-bold text-gray-900">${stats.UIDisabled ? 'Yes' : 'No'}</p>
						</div>
						<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
							<p class="text-xs font-medium text-gray-700 mb-1">Last Updated</p>
							<p class="text-xs font-semibold text-gray-900">${stats.LastUpdated ? new Date(stats.LastUpdated).toLocaleString() : 'N/A'}</p>
						</div>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(modal);
	} catch (error) {
		console.error('Failed to load player stats:', error);
		alert('Failed to load player stats: ' + error.message);
	}
}

async function viewPlayer(id) {
	try {
		const res = await fetch(`${API_BASE}/players/${id}`);
		const player = await res.json();
		
		const modal = document.createElement('div');
		modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
		modal.innerHTML = `
			<div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
				<div class="p-6 border-b border-gray-200">
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900">Player ${id}</h3>
						<button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
						</button>
					</div>
				</div>
				<div class="p-6">
					<div class="mb-6">
						<p class="text-xs font-medium text-gray-500 mb-1">Faction</p>
						<p class="text-sm text-gray-900">${player.faction ? `${player.faction.faction_name} (${player.faction.faction_tag})` : 'None'}</p>
					</div>
					<div>
						<p class="text-xs font-medium text-gray-500 mb-3">Quest Progress (${player.quests?.length || 0})</p>
						<div class="space-y-2">
							${player.quests && player.quests.length > 0 ? player.quests.map(q => `
								<div class="border border-gray-200 rounded-lg p-3">
									<div class="flex items-center justify-between mb-2">
										<h5 class="text-sm font-semibold text-gray-900">${q.display_name || q.quest_id}</h5>
										<div class="flex gap-1">
											${q.is_active ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Active</span>' : ''}
											${q.is_ready_to_complete ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Ready</span>' : ''}
										</div>
									</div>
									${q.objective_progress && q.objective_progress.length > 0 ? `
										<div class="space-y-1 mt-2">
											${q.objective_progress.map(op => `
												<div class="flex items-center justify-between text-xs">
													<span class="text-gray-600">${op.ObjectiveId || 'Unknown'}</span>
													<span class="font-medium ${op.Completed ? 'text-green-600' : 'text-gray-900'}">
														${op.CurrentValue || 0} / ${op.TargetValue || '?'} ${op.Completed ? '✓' : ''}
													</span>
												</div>
											`).join('')}
										</div>
									` : '<p class="text-xs text-gray-500">No progress</p>'}
								</div>
							`).join('') : '<p class="text-xs text-gray-500 text-center py-4">No quests</p>'}
						</div>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(modal);
	} catch (error) {
		console.error('Failed to load player:', error);
		alert('Failed to load player details');
	}
}

// Search functionality
document.addEventListener('DOMContentLoaded', () => {
	// Initialize admin mode visibility
	initAdminMode();
	
	// Check if player is logged in
	if (playerAuthToken) {
		// Try to validate token
		loginPlayer(playerAuthToken).then(valid => {
			if (valid) {
				updatePlayerUI();
			} else {
				logoutPlayer();
			}
		});
	} else {
		updatePlayerUI();
	}
	
	// Show login page if not logged in and not admin
	if (!isPlayerLoggedIn() && !isAdminMode()) {
		showPage('login', null);
	} else {
	loadDashboard();
	}
	
	// Set active nav button
	const dashboardBtn = document.querySelector('.nav-btn[data-page="dashboard"]');
	if (dashboardBtn) {
		dashboardBtn.classList.add('active');
	}
	
	// Faction search
	const factionSearch = document.getElementById('faction-search');
	if (factionSearch) {
		factionSearch.addEventListener('input', (e) => {
			const search = e.target.value.toLowerCase();
			const items = document.querySelectorAll('#factions-list > div');
			items.forEach(item => {
				const text = item.textContent.toLowerCase();
				item.style.display = text.includes(search) ? '' : 'none';
			});
		});
	}
	
	// Quest search and filters
	const questSearch = document.getElementById('quest-search');
	const questFactionFilter = document.getElementById('quest-faction-filter');
	const questTypeFilter = document.getElementById('quest-type-filter');
	
	if (questSearch) {
		questSearch.addEventListener('input', () => filterQuests());
	}
	if (questFactionFilter) {
		questFactionFilter.addEventListener('change', () => filterQuests());
	}
	if (questTypeFilter) {
		questTypeFilter.addEventListener('change', () => filterQuests());
	}
	
	// Player search
	const playerSearch = document.getElementById('player-search');
	if (playerSearch) {
		playerSearch.addEventListener('input', (e) => {
			const search = e.target.value.toLowerCase();
			const items = document.querySelectorAll('#players-list > div');
			items.forEach(item => {
				const text = item.textContent.toLowerCase();
				item.style.display = text.includes(search) ? '' : 'none';
			});
		});
	}

	// Shop search
	const shopSearch = document.getElementById('shop-search');
	if (shopSearch) {
		shopSearch.addEventListener('input', (e) => {
			const search = e.target.value.toLowerCase();
			const items = document.querySelectorAll('#shop-items-list > div');
			items.forEach(item => {
				const text = item.textContent.toLowerCase();
				item.style.display = text.includes(search) ? '' : 'none';
			});
		});
	}

	// Shop item reward type change handler
	const shopRewardType = document.getElementById('shop-item-reward-type');
	const shopCommandContainer = document.getElementById('shop-item-command-container');
	const shopAssetIdContainer = document.getElementById('shop-item-asset-id-container');
	const shopAssetIdLabel = document.getElementById('shop-item-asset-id-label');
	if (shopRewardType) {
		shopRewardType.addEventListener('change', (e) => {
			const rewardType = e.target.value;
			
			// Show/hide command field
			if (shopCommandContainer) {
				if (rewardType === 'Command') {
					shopCommandContainer.classList.remove('hidden');
				} else {
					shopCommandContainer.classList.add('hidden');
				}
			}
			
			// Update asset ID label based on reward type
			if (shopAssetIdLabel) {
				if (rewardType === 'Vehicle') {
					shopAssetIdLabel.textContent = 'Vehicle ID';
				} else if (rewardType === 'Item') {
					shopAssetIdLabel.textContent = 'Item ID (Unturned)';
				} else {
					shopAssetIdLabel.textContent = 'Asset ID (Item/Vehicle ID)';
				}
			}
			
			// Show/hide asset ID container
			if (shopAssetIdContainer) {
				if (rewardType === 'Item' || rewardType === 'Vehicle') {
					shopAssetIdContainer.classList.remove('hidden');
				} else {
					shopAssetIdContainer.classList.add('hidden');
				}
			}
		});
	}

	// Sync Cost XP and Cost Faction XP
	const shopCostXp = document.getElementById('shop-item-cost-xp');
	const shopCostFactionXp = document.getElementById('shop-item-cost-faction-xp');
	if (shopCostXp && shopCostFactionXp) {
		shopCostXp.addEventListener('input', (e) => {
			// Auto-sync Faction XP dengan XP
			shopCostFactionXp.value = e.target.value || 1;
		});
	}
});

// Update player UI (show/hide login info)
function updatePlayerUI() {
	const playerInfoEl = document.getElementById('player-info');
	const logoutBtn = document.getElementById('logout-btn');
	
	if (isPlayerLoggedIn() && playerInfo) {
		if (playerInfoEl) {
			playerInfoEl.textContent = `Logged in as: ${playerInfo.playerName}`;
			playerInfoEl.classList.remove('hidden');
		}
		if (logoutBtn) {
			logoutBtn.classList.remove('hidden');
		}
	} else {
		if (playerInfoEl) playerInfoEl.classList.add('hidden');
		if (logoutBtn) logoutBtn.classList.add('hidden');
	}
}

// Handle login form submission
async function handleLogin(event) {
	event.preventDefault();
	const codeInput = document.getElementById('auth-code-input');
	const errorDiv = document.getElementById('login-error');
	const code = codeInput.value.trim();
	
	if (!code) {
		errorDiv.textContent = 'Please enter your auth code';
		errorDiv.classList.remove('hidden');
		return;
	}
	
	const success = await loginPlayer(code);
	if (success) {
		errorDiv.classList.add('hidden');
		updatePlayerUI();
		showPage('my-quests', null);
	} else {
		errorDiv.textContent = 'Invalid auth code. Please check your code and try again.';
		errorDiv.classList.remove('hidden');
	}
}

// Load player's quests
async function loadMyQuests() {
	if (!isPlayerLoggedIn()) {
		showPage('login', null);
		return;
	}
	
	try {
		// Load active quests
		const activeRes = await fetch(`${API_BASE}/player/quests?code=${encodeURIComponent(playerAuthToken)}`);
		const activeData = await activeRes.json();
		
		const activeQuests = activeData.quests.filter(q => q.is_active);
		const activeHtml = activeQuests.length > 0
			? activeQuests.map(q => {
				const objectivesHtml = (q.objectives || []).map(obj => {
					const progress = obj.currentValue || 0;
					const target = obj.targetValue || 0;
					const completed = obj.completed || false;
					const progressPercent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
					
					return `
						<div class="mt-2 p-3 bg-gray-50 rounded-lg border ${completed ? 'border-green-300 bg-green-50' : 'border-gray-200'}">
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs font-medium text-gray-700">${escapeHtml(obj.ObjectiveName || obj.Id)}</span>
								${completed ? '<span class="text-xs font-semibold text-green-700">✓ Completed</span>' : ''}
							</div>
							<div class="flex items-center gap-2">
								<div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
									<div class="h-full ${completed ? 'bg-green-500' : 'bg-blue-500'}" style="width: ${progressPercent}%"></div>
								</div>
								<span class="text-xs font-medium text-gray-600 min-w-[60px] text-right">${progress} / ${target}</span>
							</div>
							${obj.Type ? `<p class="text-xs text-gray-500 mt-1">Type: ${escapeHtml(obj.Type)}</p>` : ''}
						</div>
					`;
				}).join('');

				const rewardsHtml = (q.rewards || []).length > 0 ? `
					<div class="mt-3 pt-3 border-t border-gray-200">
						<p class="text-xs font-semibold text-gray-700 mb-2">Rewards:</p>
						<div class="space-y-1">
							${q.rewards.map(r => {
								if (r.Type === 'PlayerXP') {
									return `<div class="text-xs text-gray-600">• ${r.Amount || 0} Player XP</div>`;
								} else if (r.Type === 'FactionPoints') {
									return `<div class="text-xs text-gray-600">• ${r.Amount || 0} Faction Points</div>`;
								} else if (r.Type === 'FactionXP') {
									return `<div class="text-xs text-gray-600">• ${r.Amount || 0} Faction XP</div>`;
								} else if (r.Type === 'Item') {
									return `<div class="text-xs text-gray-600">• ${r.Amount || 1}x Item ID ${r.ItemId || 'N/A'}</div>`;
								} else if (r.Type === 'Command') {
									return `<div class="text-xs text-gray-600">• Command: ${escapeHtml(r.Command || 'N/A')}</div>`;
								}
								return `<div class="text-xs text-gray-600">• ${escapeHtml(JSON.stringify(r))}</div>`;
							}).join('')}
						</div>
					</div>
				` : '';

				return `
					<div class="p-4 bg-white border ${q.is_ready_to_complete ? 'border-green-300' : 'border-gray-200'} rounded-lg">
						<div class="flex items-start justify-between mb-3">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h4 class="text-sm font-semibold text-gray-900">${escapeHtml(q.display_name || q.quest_id)}</h4>
									${q.is_faction_quest ? '<span class="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">Faction Quest</span>' : ''}
									${q.is_ready_to_complete ? '<span class="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">Ready to Complete</span>' : ''}
								</div>
								${q.description ? `<p class="text-xs text-gray-600 mt-1">${escapeHtml(q.description)}</p>` : ''}
							</div>
							${q.is_ready_to_complete ? `
								<button onclick="turnInQuest('${q.quest_id}')" class="ml-4 btn-primary px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap">
									Turn In
								</button>
							` : ''}
						</div>
						${objectivesHtml ? `
							<div class="mt-3">
								<p class="text-xs font-semibold text-gray-700 mb-2">Objectives:</p>
								${objectivesHtml}
							</div>
						` : ''}
						${rewardsHtml}
					</div>
				`;
			}).join('')
			: '<div class="text-center text-sm text-gray-500 py-8">No active quests</div>';
		
		document.getElementById('my-active-quests').innerHTML = activeHtml;
		
		// Load available quests
		const availableRes = await fetch(`${API_BASE}/player/available-quests?code=${encodeURIComponent(playerAuthToken)}`);
		const availableData = await availableRes.json();
		
		const availableHtml = availableData.quests.length > 0
			? availableData.quests.map(q => `
				<div class="p-4 bg-white border border-gray-200 rounded-lg">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<h4 class="text-sm font-semibold text-gray-900">${escapeHtml(q.display_name || q.id)}</h4>
							${q.description ? `<p class="text-xs text-gray-600 mt-1">${escapeHtml(q.description)}</p>` : ''}
							${q.isTaken ? '<span class="inline-block mt-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">Already Taken</span>' : ''}
						</div>
						${!q.isTaken ? `<button onclick="assignQuest('${q.id}')" class="ml-4 btn-primary px-3 py-1.5 text-xs font-medium rounded-md">Take Quest</button>` : ''}
					</div>
				</div>
			`).join('')
			: '<div class="text-center text-sm text-gray-500 py-8">No available quests</div>';
		
		document.getElementById('my-available-quests').innerHTML = availableHtml;
	} catch (error) {
		console.error('Failed to load player quests:', error);
		document.getElementById('my-active-quests').innerHTML = '<div class="text-center text-sm text-red-500 py-8">Failed to load quests</div>';
		document.getElementById('my-available-quests').innerHTML = '<div class="text-center text-sm text-red-500 py-8">Failed to load quests</div>';
	}
}

// Assign quest to player
async function assignQuest(questId) {
	if (!isPlayerLoggedIn()) {
		alert('Please login first');
		return;
	}
	
	try {
		const res = await fetch(`${API_BASE}/player/assign-quest`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Auth-Code': playerAuthToken
			},
			body: JSON.stringify({ questId })
		});
		
		const data = await res.json();
		if (data.success) {
			alert('Quest assigned successfully!');
			loadMyQuests(); // Reload quests
		} else {
			alert('Failed to assign quest: ' + (data.error || 'Unknown error'));
		}
	} catch (error) {
		console.error('Failed to assign quest:', error);
		alert('Failed to assign quest: ' + error.message);
	}
}

// Turn in quest
async function turnInQuest(questId) {
	if (!isPlayerLoggedIn()) {
		alert('Please login first');
		return;
	}
	
	if (!confirm('Are you sure you want to turn in this quest? You will need to use /sq turnin command in-game to receive rewards.')) {
		return;
	}
	
	try {
		const res = await fetch(`${API_BASE}/player/turn-in-quest`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Auth-Code': playerAuthToken
			},
			body: JSON.stringify({ questId })
		});
		
		const data = await res.json();
		if (data.success) {
			alert(data.message || 'Quest turned in successfully! Please use /sq turnin command in-game to receive rewards.');
			loadMyQuests(); // Reload quests
		} else {
			alert('Failed to turn in quest: ' + (data.error || 'Unknown error'));
		}
	} catch (error) {
		console.error('Failed to turn in quest:', error);
		alert('Failed to turn in quest: ' + error.message);
	}
}

// Shop Items
let allShopItems = [];

async function loadShopItems() {
	try {
		const res = await fetch(`${API_BASE}/shop/items`);
		allShopItems = await res.json();
		renderShopItems(allShopItems);
	} catch (error) {
		console.error('Failed to load shop items:', error);
		document.getElementById('shop-items-list').innerHTML = '<div class="text-center text-sm text-red-500 py-12">Failed to load shop items</div>';
	}
}

function renderShopItems(items) {
	if (items.length === 0) {
		document.getElementById('shop-items-list').innerHTML = '<div class="text-center text-sm text-gray-500 py-12">No shop items found</div>';
		return;
	}

	const html = items.map(item => {
		const rewardTypeColors = {
			Item: 'bg-blue-100 text-blue-700',
			Vehicle: 'bg-orange-100 text-orange-700',
			GiveXP: 'bg-green-100 text-green-700',
			Command: 'bg-purple-100 text-purple-700'
		};
		const typeColor = rewardTypeColors[item.reward_type] || 'bg-gray-100 text-gray-700';
		
		return `
			<div class="p-4 hover:bg-gray-50 transition">
				<div class="flex items-center justify-between">
					<div class="flex-1">
						<div class="flex items-center gap-2 mb-1">
							<h4 class="text-sm font-semibold text-gray-900">#${item.id} - ${item.name}</h4>
							<span class="px-2 py-0.5 ${typeColor} text-xs font-medium rounded">${item.reward_type}</span>
							${item.enabled ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Enabled</span>' : '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">Disabled</span>'}
						</div>
						<p class="text-xs text-gray-600 mb-1">
							${item.reward_type === 'Item' ? `Item ID: ${item.item_id} x${item.amount}` : ''}
							${item.reward_type === 'Vehicle' ? `Vehicle ID: ${item.item_id}` : ''}
							${item.reward_type === 'GiveXP' ? `XP: ${item.amount}` : ''}
							${item.reward_type === 'Command' ? `Command: ${item.command || 'N/A'}` : ''}
						</p>
						<p class="text-xs text-gray-500">
							Cost: ${item.cost_xp > 0 ? `${item.cost_xp} XP` : ''} ${item.cost_xp > 0 && item.cost_faction_xp > 0 ? '|' : ''} ${item.cost_faction_xp > 0 ? `${item.cost_faction_xp} FactionXP` : ''}
							${item.cost_xp === 0 && item.cost_faction_xp === 0 ? 'Free' : ''}
							${item.sell_price > 0 ? ` • Sell: ${item.sell_price} XP` : ''}
						</p>
					</div>
					<div class="flex items-center gap-2">
						<button onclick="showShopItemEditor(${item.id})" class="admin-only btn-primary px-3 py-1.5 text-xs font-medium rounded-md">Edit</button>
						<button onclick="deleteShopItem(${item.id})" class="admin-only px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition">Delete</button>
					</div>
				</div>
			</div>
		`;
	}).join('');

	document.getElementById('shop-items-list').innerHTML = html;
	// Re-apply admin mode visibility after rendering
	initAdminMode();
}

async function showShopItemEditor(itemId) {
	// Check admin mode before allowing edit
	if (!isAdminMode()) {
		return;
	}
	
	const modal = document.getElementById('shop-item-modal');
	modal.classList.remove('hidden');
	
	// Update modal title
	const titleEl = document.getElementById('shop-item-modal-title');
	if (titleEl) {
		titleEl.textContent = itemId ? 'Edit Shop Item' : 'New Shop Item';
	}
	
	// Reset form
	document.getElementById('shop-item-form').reset();
	document.getElementById('shop-item-command-container').classList.add('hidden');
	const shopAssetIdContainer = document.getElementById('shop-item-asset-id-container');
	const shopAssetIdLabel = shopAssetIdContainer ? shopAssetIdContainer.querySelector('label') : null;
	
	if (itemId) {
		// Edit mode
		try {
			const res = await fetch(`${API_BASE}/shop/items/${itemId}`);
			const item = await res.json();
			
			document.getElementById('shop-item-id').value = item.id;
			document.getElementById('shop-item-id').readOnly = true;
			document.getElementById('shop-item-name').value = item.name || '';
			const rewardType = item.reward_type || 'Item';
			document.getElementById('shop-item-reward-type').value = rewardType;
			document.getElementById('shop-item-item-id').value = item.item_id || 0;
			document.getElementById('shop-item-amount').value = item.amount || 1;
			document.getElementById('shop-item-cost-xp').value = item.cost_xp || 1;
			document.getElementById('shop-item-cost-faction-xp').value = item.cost_faction_xp || item.cost_xp || 1;
			document.getElementById('shop-item-sell-price').value = item.sell_price || 0;
			document.getElementById('shop-item-command').value = item.command || '';
			document.getElementById('shop-item-enabled').checked = item.enabled !== false;
			
			// Show/hide fields based on reward type
			if (rewardType === 'Command') {
				document.getElementById('shop-item-command-container').classList.remove('hidden');
			}
			
			// Update asset ID label and visibility
			const shopAssetIdLabel = document.getElementById('shop-item-asset-id-label');
			if (shopAssetIdLabel) {
				if (rewardType === 'Vehicle') {
					shopAssetIdLabel.textContent = 'Vehicle ID';
					if (shopAssetIdContainer) shopAssetIdContainer.classList.remove('hidden');
				} else if (rewardType === 'Item') {
					shopAssetIdLabel.textContent = 'Item ID (Unturned)';
					if (shopAssetIdContainer) shopAssetIdContainer.classList.remove('hidden');
				} else {
					shopAssetIdLabel.textContent = 'Asset ID (Item/Vehicle ID)';
					if (shopAssetIdContainer) shopAssetIdContainer.classList.add('hidden');
				}
			}
		} catch (error) {
			console.error('Failed to load shop item:', error);
			alert('Failed to load shop item: ' + error.message);
		}
	} else {
		// New item mode
		document.getElementById('shop-item-id').readOnly = false;
		const shopAssetIdLabel = document.getElementById('shop-item-asset-id-label');
		if (shopAssetIdLabel) {
			shopAssetIdLabel.textContent = 'Item ID (Unturned)';
		}
		if (shopAssetIdContainer) {
			shopAssetIdContainer.classList.remove('hidden');
		}
	}
}

function closeShopItemEditor() {
	document.getElementById('shop-item-modal').classList.add('hidden');
}

async function saveShopItem(event) {
	event.preventDefault();
	
	// Check admin mode before allowing save
	if (!isAdminMode()) {
		return;
	}
	
	const costXp = parseInt(document.getElementById('shop-item-cost-xp').value) || 1;
	const item = {
		id: parseInt(document.getElementById('shop-item-id').value),
		name: document.getElementById('shop-item-name').value,
		reward_type: document.getElementById('shop-item-reward-type').value,
		item_id: parseInt(document.getElementById('shop-item-item-id').value) || 0,
		amount: parseInt(document.getElementById('shop-item-amount').value) || 1,
		cost_xp: costXp,
		cost_faction_xp: parseInt(document.getElementById('shop-item-cost-faction-xp').value) || costXp, // Sync dengan cost_xp jika kosong
		sell_price: parseInt(document.getElementById('shop-item-sell-price').value) || 0,
		command: document.getElementById('shop-item-command').value || null,
		enabled: document.getElementById('shop-item-enabled').checked
	};
	
	try {
		const res = await fetch(`${API_BASE}/shop/items`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(item)
		});
		
		const result = await res.json();
		if (result.success) {
			alert('Shop item saved successfully!');
			closeShopItemEditor();
			loadShopItems();
		} else {
			alert('Failed to save shop item: ' + (result.error || 'Unknown error'));
		}
	} catch (error) {
		console.error('Failed to save shop item:', error);
		alert('Failed to save shop item: ' + error.message);
	}
}

async function deleteShopItem(itemId) {
	// Check admin mode before allowing delete
	if (!isAdminMode()) {
		return;
	}
	
	if (!confirm(`Are you sure you want to delete shop item #${itemId}?`)) {
		return;
	}
	
	try {
		const res = await fetch(`${API_BASE}/shop/items/${itemId}`, {
			method: 'DELETE'
		});
		
		const result = await res.json();
		if (result.success) {
			alert('Shop item deleted successfully!');
			loadShopItems();
		} else {
			alert('Failed to delete shop item: ' + (result.error || 'Unknown error'));
		}
	} catch (error) {
		console.error('Failed to delete shop item:', error);
		alert('Failed to delete shop item: ' + error.message);
	}
}

// Commands
let allCommands = [];
let filteredCommands = [];

async function loadCommands() {
	try {
		const res = await fetch(`${API_BASE}/commands`);
		const data = await res.json();
		
		allCommands = data.commands || [];
		filteredCommands = allCommands;
		
		renderCommands();
		
		// Setup search
		const searchInput = document.getElementById('command-search');
		if (searchInput) {
			searchInput.oninput = (e) => {
				const query = e.target.value.toLowerCase().trim();
				if (query === '') {
					filteredCommands = allCommands;
				} else {
					filteredCommands = allCommands.filter(cmd => {
						return cmd.name.toLowerCase().includes(query) ||
						       cmd.help.toLowerCase().includes(query) ||
						       cmd.syntax.toLowerCase().includes(query) ||
						       (cmd.aliases && cmd.aliases.some(a => a.toLowerCase().includes(query))) ||
						       cmd.category.toLowerCase().includes(query);
					});
				}
				renderCommands();
			};
		}
	} catch (error) {
		console.error('Failed to load commands:', error);
		document.getElementById('commands-list').innerHTML = `
			<div class="text-center text-sm text-red-500 py-12">
				Failed to load commands: ${error.message}
			</div>
		`;
	}
}

function renderCommands() {
	const container = document.getElementById('commands-list');
	if (!container) return;
	
	if (filteredCommands.length === 0) {
		container.innerHTML = `
			<div class="text-center text-sm text-gray-500 py-12">
				No commands found. Try a different search term.
			</div>
		`;
		return;
	}
	
	// Group by category
	const grouped = {};
	filteredCommands.forEach(cmd => {
		const category = cmd.category || 'Other';
		if (!grouped[category]) {
			grouped[category] = [];
		}
		grouped[category].push(cmd);
	});
	
	const categories = Object.keys(grouped).sort();
	
	let html = '';
	categories.forEach(category => {
		html += `
			<div class="mb-8">
				<h3 class="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">${category}</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		`;
		
		grouped[category].forEach(cmd => {
			const aliases = cmd.aliases && cmd.aliases.length > 0 
				? `<div class="text-xs text-gray-500 mt-1">Aliases: ${cmd.aliases.join(', ')}</div>`
				: '';
			
			html += `
				<div class="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition">
					<div class="flex items-start justify-between mb-2">
						<div class="flex-1">
							<div class="flex items-center gap-2 mb-1">
								<code class="text-sm font-mono font-semibold text-indigo-600">/${cmd.name}</code>
								<span class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">${category}</span>
							</div>
							${aliases}
						</div>
					</div>
					<p class="text-sm text-gray-700 mb-2">${cmd.help || 'No description available'}</p>
					<div class="mt-3 pt-3 border-t border-gray-100">
						<div class="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">
							${cmd.syntax || `/${cmd.name}`}
						</div>
					</div>
				</div>
			`;
		});
		
		html += `
				</div>
			</div>
		`;
	});
	
	container.innerHTML = html;
}
