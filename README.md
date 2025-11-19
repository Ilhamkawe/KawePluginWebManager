# KawePluginsStandalone Web Manager

Web-based management interface for KawePluginsStandalone plugin.

## Features

- 📊 **Dashboard** - Overview of server statistics
- 👥 **Factions** - View and manage factions
- 📜 **Quests** - Create, edit, and manage quests with custom timers
- 🎮 **Players** - View player statistics and quest progress
- 🛒 **Shop** - Manage shop items (Items, Vehicles, XP, Commands)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Edit `.env` with your database credentials:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=unturned
TABLE_PREFIX=kawe_
PORT=3000
```

## Running

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Then open http://localhost:3000 in your browser.

## Quick Start Guide

### Managing Quests

1. **Create a Quest**:
   - Click "Quests" tab → "+ New Quest"
   - Fill in quest details (ID, Name, Description)
   - Set Quest Type (Daily, Weekly, Monthly, Repeat)
   - For Faction Quests: Enable "Faction Quest" checkbox
   - Set Timer (in seconds, 0 = use default from config)
   - Add Objectives (Kill Zombie, Gather Item, etc.)
   - Add Rewards (XP, Items, Faction Points, etc.)

2. **Filter Quests**:
   - Use "Faction Filter" to show only faction/non-faction quests
   - Use "Type Filter" to filter by quest type

### Managing Shop Items

1. **Add Shop Item**:
   - Click "Shop" tab → "+ New Item"
   - Set Item ID (for Item/Vehicle) or leave 0 for Command/GiveXP
   - Choose Reward Type (Item, Vehicle, GiveXP, Command)
   - Set Cost XP and Cost Faction XP (default: 1, auto-synced)
   - Set Sell Price (0 = not sellable)
   - Enable/Disable item

2. **Vehicle Purchase**:
   - Select "Vehicle" as Reward Type
   - Enter Vehicle ID (from Unturned)
   - Vehicle will spawn at player location when purchased

### Viewing Player Stats

1. **Player List**:
   - Click "Players" tab
   - Search by name or SteamID
   - Click "Details" to view full statistics

2. **Player Statistics Include**:
   - Kills, Headshots, Deaths (PVP/PVE)
   - Zombies, Mega Zombies, Animals killed
   - Resources harvested, Structures built
   - Playtime and more

## API Endpoints

### Health & Dashboard
- `GET /api/health` - Health check
- `GET /api/dashboard/stats` - Dashboard statistics

### Factions
- `GET /api/factions` - List all factions
- `GET /api/factions/:id` - Get faction details

### Quests
- `GET /api/quests` - List all quests (supports filtering)
- `GET /api/quests/:id` - Get quest details with progress
- `POST /api/quests` - Create/Update quest

### Players
- `GET /api/players` - List players with statistics
- `GET /api/players/:id/stats` - Get detailed player statistics

### Shop Items
- `GET /api/shop/items` - List all shop items
- `GET /api/shop/items/:id` - Get shop item details
- `POST /api/shop/items` - Create/Update shop item
- `DELETE /api/shop/items/:id` - Delete shop item

## Design

- **Minimalist & Charming** - Clean, modern interface
- **Tailwind CSS** - Utility-first CSS framework
- **Responsive** - Works on desktop and mobile
- **Gradient Theme** - Beautiful purple gradient navigation

## Features Details

### Quest Management
- **Quest Types**: Daily, Weekly, Monthly, Repeat
- **Faction Quests**: Special quests for factions with shared progress
- **Custom Timers**: Set timer per quest (in seconds, 0 = use default from config)
- **Quest Filters**: Filter by faction status and quest type
- **Tier System**: Quest tier (1-5) for faction quests

### Shop Management
- **Reward Types**: Item, Vehicle, GiveXP, Command
- **Pricing**: Set cost in XP and/or Faction XP (default: 1)
- **Sell Price**: Configure sell price for items (0 = not sellable)
- **Auto-sync**: Cost XP and Faction XP are synced by default
- **Database Storage**: All shop items stored in MySQL database

### Player Statistics
- View comprehensive player stats from `PlayerStatsNew` table
- Track kills, deaths, zombies, animals, resources, playtime, etc.
- Detailed view with all player metrics

## Notes

- Shop items are stored in MySQL database (`kawe_shop_items` table)
- Faction quests support custom timers per quest
- Quest progress is stored in MySQL database with real-time updates
- Shop items support vehicle spawning and command execution
- Default cost for shop items is 1 XP/Faction XP (can be customized)

