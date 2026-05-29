const BASE = "https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main";

let teamsData = [];
let matchesData = [];
let groupsData = [];
let stadiumsData = [];

let todayMatches = [];
let currentMatchIndex = 0;
let calendar = null;
let selectedFilterTeams = [];

// Knockout state - Official FIFA 2026 Format
let knockoutState = {
    round32: [],
    round16: [],
    quarterfinals: [],
    semifinals: [],
    thirdPlace: null,
    final: null,
    winner: null
};

// Store fixed Round of 32 qualifiers (legit from API)
let fixedRound32Qualifiers = [];

// Track which matches have legit results from API (protected)
let legitMatchResults = new Set();

function parseMatchDate(dateString) {
    if (!dateString) return null;
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) return parsed;
    const isoParsed = new Date(dateString + "T12:00:00");
    if (!isNaN(isoParsed.getTime())) return isoParsed;
    return null;
}

async function fetchJSON(file) {
    try {
        const response = await fetch(`${BASE}/${file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${file}:`, error);
        return [];
    }
}

async function initializeWebsite() {
    console.log("Loading World Cup 2026 data...");
    
    [
        teamsData,
        matchesData,
        groupsData,
        stadiumsData
    ] = await Promise.all([
        fetchJSON("football.teams.json"),
        fetchJSON("football.matches.json"),
        fetchJSON("football.matchtables.json"),
        fetchJSON("football.stadiums.json")
    ]);
    
    console.log(`Loaded: ${teamsData.length} teams, ${matchesData.length} matches`);
    
    normalizeMatches();
    getTodayMatches();
    createFlagMarquee();
    renderHeroMatch();
    renderCalendar();
    renderGroupsDefault();
    renderStadiums();
    initKnockoutBracket();
    hidePreloader();
    
    initMobileSidebar();
    addFilterButtonToCalendar();
    
    // Auto-sync with API every 30 seconds
    setInterval(() => {
        syncBracketWithAPIMatches();
    }, 30000);
}

function hidePreloader() {
    setTimeout(() => {
        const preloader = document.getElementById("preloader");
        if (preloader) preloader.style.display = "none";
    }, 1000);
}

function normalizeMatches() {
    matchesData = matchesData
        .map(match => {
            let rawDate = match.local_date || match.date;
            if (!rawDate) return null;
            const parsed = parseMatchDate(rawDate);
            if (!parsed) return null;
            return { ...match, parsedDate: parsed, originalDate: rawDate };
        })
        .filter(Boolean)
        .sort((a, b) => a.parsedDate - b.parsedDate);
}

function getTodayMatches() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    todayMatches = matchesData.filter(match => {
        const matchDate = new Date(match.parsedDate);
        matchDate.setHours(0, 0, 0, 0);
        return matchDate.getTime() === today.getTime();
    });
    
    if (todayMatches.length === 0) {
        const now = new Date();
        todayMatches = matchesData.filter(match => match.parsedDate > now).slice(0, 5);
        if (todayMatches.length === 0 && matchesData.length > 0) {
            todayMatches = matchesData.slice(0, 5);
        }
    }
}

function getTeamById(id) {
    return teamsData.find(team => String(team.id) === String(id));
}

function getFlag(id) {
    const team = getTeamById(id);
    if (team?.flag) return team.flag;
    if (team?.fifa_code) {
        return `https://flagcdn.com/w320/${team.fifa_code.toLowerCase()}.png`;
    }
    return `https://flagcdn.com/w320/un.png`;
}

function getMatchStatus(match) {
    const now = new Date();
    const matchTime = match.parsedDate.getTime();
    const diff = matchTime - now.getTime();
    
    if (diff < 0 && Math.abs(diff) < 10800000) return "LIVE";
    if (diff < 0) return "ENDED";
    return match.parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function createFlagMarquee() {
    const marqueeContainer = document.getElementById('flagMarquee');
    if (!marqueeContainer || !teamsData.length) return;
    
    const allTeams = teamsData.map(team => ({
        name: team.name_en,
        code: team.fifa_code,
        flag: getFlag(team.id)
    }));
    
    const tripledTeams = [...allTeams, ...allTeams, ...allTeams];
    
    let marqueeHTML = '<div class="marquee-track">';
    
    tripledTeams.forEach((team, index) => {
        marqueeHTML += `
            <div class="flag-item" data-team="${team.name}">
                <img src="${team.flag}" alt="${team.name}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                <span>${team.code || team.name.substring(0, 3).toUpperCase()}</span>
            </div>
        `;
    });
    
    marqueeHTML += '</div>';
    marqueeContainer.innerHTML = marqueeHTML;
    
    const track = document.querySelector('.marquee-track');
    if (track) {
        const itemCount = tripledTeams.length;
        const duration = Math.max(25, itemCount * 0.5);
        track.style.animationDuration = `${duration}s`;
    }
}

function renderGroupsDefault() {
    const container = document.getElementById("groups-container");
    if (!container) return;
    
    if (!teamsData.length) {
        container.innerHTML = "<p>Loading group data...</p>";
        return;
    }
    
    const teamsByGroup = {};
    teamsData.forEach(team => {
        if (team.groups) {
            const groupLetter = team.groups;
            if (!teamsByGroup[groupLetter]) {
                teamsByGroup[groupLetter] = [];
            }
            teamsByGroup[groupLetter].push({
                id: team.id,
                name: team.name_en,
                flag: getFlag(team.id),
                fifa_code: team.fifa_code
            });
        }
    });
    
    const groupLetters = Object.keys(teamsByGroup).sort();
    
    let html = '';
    
    groupLetters.forEach(groupLetter => {
        const teams = teamsByGroup[groupLetter];
        if (!teams || teams.length === 0) return;
        
        const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));
        
        html += `
            <div class="group-card">
                <h3>Group ${groupLetter}</h3>
                <div class="group-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Team</th>
                                <th>P</th>
                                <th>W</th>
                                <th>D</th>
                                <th>L</th>
                                <th>GF</th>
                                <th>GA</th>
                                <th>GD</th>
                                <th>Pts</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        sortedTeams.forEach(team => {
            html += `
                <tr>
                    <td class="team-cell">
                        <img src="${team.flag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                        <span class="team-name">${team.name}</span>
                     </td>
                     <td>0</td>
                     <td>0</td>
                     <td>0</td>
                     <td>0</td>
                     <td>0</td>
                     <td>0</td>
                     <td>0</td>
                    <td class="points-cell">0</td>
                 </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderHeroMatch() {
    const container = document.getElementById("latest-match-card");
    if (!todayMatches.length) {
        container.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px;">
            <p>Opening Match: June 11, 2026</p>
            <p style="font-size: 12px; margin-top: 8px;">Mexico vs South Africa at Estadio Azteca</p>
        </div>`;
        return;
    }
    
    const match = todayMatches[currentMatchIndex];
    const home = getTeamById(match.home_team_id);
    const away = getTeamById(match.away_team_id);
    
    container.innerHTML = `
        <div class="premium-match-wrapper">
            <button class="premium-arrow" onclick="window.previousMatch()">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="latest-match">
                <div class="team">
                    <img src="${getFlag(match.home_team_id)}" alt="${home?.name_en || 'Home'}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                    <h3>${home?.name_en || 'Home'}</h3>
                </div>
                <div class="center-match">
                    <div class="score">
                        ${match.home_score ?? 0}
                        <span>:</span>
                        ${match.away_score ?? 0}
                    </div>
                    <div class="status">${getMatchStatus(match)}</div>
                    <div style="font-size:11px; margin-top:8px; color:#888;">${match.group ? `Group ${match.group}` : match.type || 'Match'}</div>
                </div>
                <div class="team">
                    <img src="${getFlag(match.away_team_id)}" alt="${away?.name_en || 'Away'}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                    <h3>${away?.name_en || 'Away'}</h3>
                </div>
            </div>
            <button class="premium-arrow" onclick="window.nextMatch()">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;
}

window.nextMatch = function() {
    if (todayMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % todayMatches.length;
    renderHeroMatch();
};

window.previousMatch = function() {
    if (todayMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + todayMatches.length) % todayMatches.length;
    renderHeroMatch();
};

function showMatchModal(match) {
    const modal = document.getElementById("matchModal");
    const modalBody = document.getElementById("modalBody");
    const watermarkDiv = document.querySelector(".modal-watermark");
    
    if (!modal || !modalBody) return;
    
    const home = getTeamById(match.home_team_id);
    const away = getTeamById(match.away_team_id);
    const homeFlag = getFlag(match.home_team_id);
    const awayFlag = getFlag(match.away_team_id);
    
    if (watermarkDiv) {
        watermarkDiv.style.backgroundImage = `url('${homeFlag}'), url('${awayFlag}')`;
        watermarkDiv.style.backgroundSize = "40%, 40%";
        watermarkDiv.style.backgroundPosition = "left center, right center";
        watermarkDiv.style.backgroundRepeat = "no-repeat, no-repeat";
    }
    
    const matchDate = match.parsedDate ? match.parsedDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }) : 'Date TBD';
    
    modalBody.innerHTML = `
        <div class="modal-score-row">
            <div class="modal-score-flag">
                <img src="${homeFlag}" alt="${home?.name_en}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                <span style="color: white;">${home?.fifa_code || ''}</span>
            </div>
            <div class="modal-score-number">
                ${match.home_score ?? 0}<span>:</span>${match.away_score ?? 0}
            </div>
            <div class="modal-score-flag">
                <img src="${awayFlag}" alt="${away?.name_en}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                <span style="color: white;">${away?.fifa_code || ''}</span>
            </div>
        </div>
     
        <div class="modal-info">
            <div class="modal-info-item">
                <div class="label">Date</div>
                <div class="value">${matchDate}</div>
            </div>
            <div class="modal-info-item">
                <div class="label">Time</div>
                <div class="value">${match.local_time || match.time || 'TBD'}</div>
            </div>
            <div class="modal-info-item">
                <div class="label">Venue</div>
                <div class="value">${match.stadium || match.venue || 'TBD'}</div>
            </div>
            <div class="modal-info-item">
                <div class="label">Round</div>
                <div class="value">${match.group ? `Group ${match.group}` : (match.type || 'Match')}</div>
            </div>
        </div>
    `;
    
    modal.style.display = "flex";
}

function getFilteredEvents() {
    let filteredMatches = matchesData;
    
    if (selectedFilterTeams.length > 0) {
        filteredMatches = matchesData.filter(match => {
            return selectedFilterTeams.includes(String(match.home_team_id)) || 
                   selectedFilterTeams.includes(String(match.away_team_id));
        });
    }
    
    return filteredMatches.filter(match => match.parsedDate).map(match => {
        const home = getTeamById(match.home_team_id);
        const away = getTeamById(match.away_team_id);
        const date = new Date(match.parsedDate);
        date.setHours(12, 0, 0, 0);
        
        return {
            id: match.id,
            title: `${home?.name_en || '?'} vs ${away?.name_en || '?'}`,
            start: date,
            allDay: true,
            extendedProps: { 
                match: match, 
                homeName: home?.name_en || "TBD", 
                awayName: away?.name_en || "TBD", 
                homeFlag: getFlag(match.home_team_id), 
                awayFlag: getFlag(match.away_team_id), 
                homeScore: match.home_score ?? 0, 
                awayScore: match.away_score ?? 0, 
                time: match.local_time || match.time || "TBD", 
                stadium: match.stadium || match.venue || "TBD", 
                status: getMatchStatus(match), 
                group: match.group || match.type || "Match" 
            }
        };
    });
}

function renderCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;
    
    const events = getFilteredEvents();
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth", 
        height: "auto", 
        expandRows: true, 
        fixedWeekCount: false,
        initialDate: "2026-06-01",
        headerToolbar: { 
            left: "prev", 
            center: "title", 
            right: "next" 
        },
        events: events,
        eventContent: function(info) {
            const p = info.event.extendedProps;
            return { html: `<div class="calendar-event"><img src="${p.homeFlag}" class="cal-flag" onerror="this.src='https://flagcdn.com/w320/un.png'"><span class="cal-vs">VS</span><img src="${p.awayFlag}" class="cal-flag" onerror="this.src='https://flagcdn.com/w320/un.png'"></div>` };
        },
        eventDidMount: function(info) {
            const p = info.event.extendedProps;
            const tooltip = document.createElement("div");
            tooltip.className = "calendar-tooltip";
            tooltip.innerHTML = ``;
            document.body.appendChild(tooltip);
            
            let hoverTimeout;
            info.el.addEventListener("mouseenter", function(e) {
                hoverTimeout = setTimeout(() => {
                    tooltip.style.display = "block";
                    const rect = info.el.getBoundingClientRect();
                    tooltip.style.left = rect.left + window.scrollX + "px";
                    tooltip.style.top = rect.bottom + window.scrollY + 8 + "px";
                }, 200);
            });
            info.el.addEventListener("mousemove", function(e) {
                if (tooltip.style.display === "block") {
                    tooltip.style.left = (e.clientX + window.scrollX + 15) + "px";
                    tooltip.style.top = (e.clientY + window.scrollY + 15) + "px";
                }
            });
            info.el.addEventListener("mouseleave", function() { clearTimeout(hoverTimeout); tooltip.style.display = "none"; });
            info.el.addEventListener("click", function(e) { showMatchModal(p.match); });
        }
    });
    
    calendar.render();
}

function refreshCalendar() {
    if (calendar) {
        const newEvents = getFilteredEvents();
        calendar.removeAllEvents();
        calendar.addEventSource(newEvents);
    }
}

function addFilterButtonToCalendar() {
    setTimeout(() => {
        const toolbarCenter = document.querySelector('.fc-toolbar-chunk');
        if (toolbarCenter) {
            if (document.querySelector('.calendar-filter-btn')) return;
            
            const filterBtn = document.createElement('button');
            filterBtn.className = 'fc-button fc-button-primary calendar-filter-btn';
            filterBtn.innerHTML = '<i class="fa-solid fa-filter"></i>';
            filterBtn.style.marginLeft = '10px';
            filterBtn.style.background = '#2c3e50';
            filterBtn.style.border = 'none';
            filterBtn.style.padding = '10px 15px';
            filterBtn.style.borderRadius = '5px';
            filterBtn.style.cursor = 'pointer';
            filterBtn.style.fontSize = '14px';
            filterBtn.style.fontWeight = '500';
            
            filterBtn.onclick = showFilterModal;
            
            toolbarCenter.appendChild(filterBtn);
            
            updateFilterBadge();
        } else {
            setTimeout(addFilterButtonToCalendar, 500);
        }
    }, 300);
}

function updateFilterBadge() {
    const existingBadge = document.querySelector('.filter-badge');
    if (existingBadge) existingBadge.remove();
    
    if (selectedFilterTeams.length > 0) {
        const filterBtn = document.querySelector('.calendar-filter-btn');
        if (filterBtn) {
            const badge = document.createElement('span');
            badge.className = 'filter-badge';
            badge.innerHTML = selectedFilterTeams.length;
            badge.style.position = 'relative';
            badge.style.top = '-10px';
            badge.style.right = '5px';
            badge.style.background = '#2c3e50';
            badge.style.color = 'white';
            badge.style.fontSize = '10px';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '20px';
            badge.style.marginLeft = '5px';
            filterBtn.style.position = 'relative';
            filterBtn.appendChild(badge);
        }
    }
}

function showFilterModal() {
    let filterModal = document.getElementById('teamFilterModal');
    
    if (!filterModal) {
        filterModal = document.createElement('div');
        filterModal.id = 'teamFilterModal';
        filterModal.className = 'modal filter-modal';
        filterModal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-container filter-modal-container">
                <div class="modal-header">
                    <h2>Filter by Team</h2>
                    <button class="modal-close filter-modal-close">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
                <div class="modal-body filter-modal-body">
                    <div class="filter-search">
                        <input type="text" id="teamSearchInput" placeholder="Search teams..." class="filter-search-input">
                    </div>
                    <div class="filter-actions">
                        <button id="selectAllTeams" class="filter-action-btn">Select All</button>
                        <button id="clearAllTeams" class="filter-action-btn clear">Clear All</button>
                    </div>
                    <div class="teams-grid" id="teamsGrid"></div>
                    <div class="filter-footer">
                        <button id="applyTeamFilter" class="filter-apply-btn">Apply Filter</button>
                        <button id="cancelTeamFilter" class="filter-cancel-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(filterModal);
        
        const style = document.createElement('style');
        style.textContent = `
            .filter-modal-container { max-width: 600px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; }
            .filter-modal-body { overflow-y: auto; max-height: 60vh; }
            .filter-search { margin-bottom: 20px; }
            .filter-search-input { width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; color: white; font-size: 14px; font-family: 'Inter', sans-serif; }
            .filter-search-input:focus { outline: none; border-color: #c8102e; }
            .filter-actions { display: flex; gap: 12px; margin-bottom: 20px; }
            .filter-action-btn { flex: 1; padding: 8px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; cursor: pointer; font-size: 12px; transition: all 0.3s; }
            .filter-action-btn:hover { background: rgba(200,16,46,0.3); border-color: #c8102e; }
            .teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
            .team-filter-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 10px; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; }
            .team-filter-item:hover { background: rgba(255,255,255,0.08); }
            .team-filter-item.selected { background: rgba(200,16,46,0.2); border-color: #c8102e; }
            .team-filter-item img { width: 32px; height: 21px; object-fit: cover; border-radius: 4px; }
            .team-filter-item span { font-size: 13px; font-weight: 500; }
            .team-filter-item input { margin-left: auto; width: 18px; height: 18px; cursor: pointer; accent-color: #c8102e; }
            .filter-footer { display: flex; gap: 12px; margin-top: 10px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
            .filter-apply-btn, .filter-cancel-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.3s; font-size: 14px; }
            .filter-apply-btn { background: #c8102e; border: none; color: white; }
            .filter-apply-btn:hover { background: #a00d26; }
            .filter-cancel-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; }
        `;
        document.head.appendChild(style);
        
        const closeBtn = filterModal.querySelector('.filter-modal-close');
        const cancelBtn = filterModal.querySelector('#cancelTeamFilter');
        const overlay = filterModal.querySelector('.modal-overlay');
        
        const closeFilterModal = () => { filterModal.style.display = 'none'; };
        closeBtn.onclick = closeFilterModal;
        cancelBtn.onclick = closeFilterModal;
        overlay.onclick = closeFilterModal;
    }
    
    loadTeamsIntoGrid();
    
    const applyBtn = document.getElementById('applyTeamFilter');
    const newApplyBtn = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
    
    newApplyBtn.onclick = () => {
        const selectedCheckboxes = document.querySelectorAll('#teamsGrid .team-checkbox:checked');
        selectedFilterTeams = Array.from(selectedCheckboxes).map(cb => cb.value);
        refreshCalendar();
        filterModal.style.display = 'none';
    };
    
    const selectAllBtn = document.getElementById('selectAllTeams');
    const newSelectAllBtn = selectAllBtn.cloneNode(true);
    selectAllBtn.parentNode.replaceChild(newSelectAllBtn, selectAllBtn);
    newSelectAllBtn.onclick = () => {
        document.querySelectorAll('#teamsGrid .team-checkbox').forEach(cb => {
            cb.checked = true;
            cb.closest('.team-filter-item').classList.add('selected');
        });
    };
    
    const clearAllBtn = document.getElementById('clearAllTeams');
    const newClearAllBtn = clearAllBtn.cloneNode(true);
    clearAllBtn.parentNode.replaceChild(newClearAllBtn, clearAllBtn);
    newClearAllBtn.onclick = () => {
        document.querySelectorAll('#teamsGrid .team-checkbox').forEach(cb => {
            cb.checked = false;
            cb.closest('.team-filter-item').classList.remove('selected');
        });
    };
    
    const searchInput = document.getElementById('teamSearchInput');
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.oninput = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('.team-filter-item').forEach(item => {
            const teamName = item.querySelector('span').textContent.toLowerCase();
            item.style.display = teamName.includes(searchTerm) ? 'flex' : 'none';
        });
    };
    
    filterModal.style.display = 'flex';
}

function loadTeamsIntoGrid() {
    const teamsGrid = document.getElementById('teamsGrid');
    if (!teamsGrid) return;
    
    const sortedTeams = [...teamsData].sort((a, b) => a.name_en.localeCompare(b.name_en));
    
    teamsGrid.innerHTML = sortedTeams.map(team => {
        const isChecked = selectedFilterTeams.includes(String(team.id));
        return `
            <div class="team-filter-item ${isChecked ? 'selected' : ''}" data-team-id="${team.id}">
                <img src="${getFlag(team.id)}" onerror="this.src='https://flagcdn.com/w320/un.png'" alt="${team.name_en}">
                <span>${team.name_en}</span>
                <input type="checkbox" class="team-checkbox" value="${team.id}" ${isChecked ? 'checked' : ''}>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.team-filter-item').forEach(item => {
        const checkbox = item.querySelector('.team-checkbox');
        item.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        checkbox.addEventListener('change', (e) => {
            if (checkbox.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    });
}

function renderStadiums() {
    const container = document.getElementById("stadiums-container");
    if (!container) return;
    if (!stadiumsData || stadiumsData.length === 0) { container.innerHTML = "<p>Loading stadium data...</p>"; return; }
    
    container.innerHTML = stadiumsData.map(stadium => `
        <div class="stadium-card">
            <h3>${stadium.name_en || stadium.name || 'Stadium'}</h3>
            <p>${stadium.city_en || stadium.city || 'Unknown'}</p>
            <p>Capacity: ${Number(stadium.capacity).toLocaleString()}</p>
        </div>
    `).join('');
}

// ============= SMART KNOCKOUT BRACKET - PROTECTS LEGIT RESULTS =============
function initKnockoutBracket() {
    if (!teamsData.length) { setTimeout(initKnockoutBracket, 500); return; }
    
    buildFixedRound32FromAPI();
    renderKnockoutBracket();
    
    document.getElementById('simulateKnockoutBtn')?.addEventListener('click', () => simulateOnlyUnplayedMatches());
    document.getElementById('resetKnockoutBtn')?.addEventListener('click', () => resetOnlyUnplayedMatches());
}

function buildFixedRound32FromAPI() {
    console.log("Building fixed Round of 32 from API data...");
    
    const qualifiers = getQualifiersFromGroupData();
    
    if (qualifiers.length >= 32) {
        console.log(`Found ${qualifiers.length} qualified teams from API`);
        fixedRound32Qualifiers = qualifiers.slice(0, 32);
    } else {
        console.log(`Only ${qualifiers.length} teams found, using all teams`);
        fixedRound32Qualifiers = [...teamsData].slice(0, 32);
    }
    
    const round32Matches = createOfficialPairings(fixedRound32Qualifiers);
    knockoutState.round32 = round32Matches;
    knockoutState.round16 = [];
    knockoutState.quarterfinals = [];
    knockoutState.semifinals = [];
    knockoutState.thirdPlace = null;
    knockoutState.final = null;
    knockoutState.winner = null;
    
    // Sync with API to protect legit results
    syncBracketWithAPIMatches();
}

function getQualifiersFromGroupData() {
    const groupStandings = {};
    
    if (groupsData && groupsData.length > 0) {
        groupsData.forEach(group => {
            const groupName = group.name || group._id;
            if (!groupStandings[groupName]) {
                groupStandings[groupName] = [];
            }
            if (group.teams) {
                group.teams.forEach(team => {
                    groupStandings[groupName].push({
                        id: team.id,
                        name: team.name_en || team.name,
                        teamObj: getTeamById(team.id),
                        played: team.played || 0,
                        points: team.points || 0,
                        gd: (team.gf || 0) - (team.ga || 0),
                        gf: team.gf || 0,
                        ga: team.ga || 0
                    });
                });
            }
        });
    } else {
        teamsData.forEach(team => {
            if (team.groups) {
                if (!groupStandings[team.groups]) {
                    groupStandings[team.groups] = [];
                }
                groupStandings[team.groups].push({
                    id: team.id,
                    name: team.name_en,
                    teamObj: team,
                    played: 0,
                    points: 0,
                    gd: 0,
                    gf: 0,
                    ga: 0
                });
            }
        });
    }
    
    for (const group in groupStandings) {
        groupStandings[group].sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.gd !== b.gd) return b.gd - a.gd;
            return b.gf - a.gf;
        });
    }
    
    const groupWinners = [];
    const groupRunnersUp = [];
    const thirdPlacedTeams = [];
    
    for (const [groupName, teams] of Object.entries(groupStandings)) {
        if (teams[0]) groupWinners.push({ ...teams[0], group: groupName, position: 1 });
        if (teams[1]) groupRunnersUp.push({ ...teams[1], group: groupName, position: 2 });
        if (teams[2]) thirdPlacedTeams.push({ ...teams[2], group: groupName, position: 3 });
    }
    
    const sortedThirdPlaced = thirdPlacedTeams.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.gd !== b.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });
    
    const bestThirdPlaced = sortedThirdPlaced.slice(0, 8);
    
    const allQualifiers = [...groupWinners, ...groupRunnersUp, ...bestThirdPlaced];
    
    return allQualifiers.map(q => q.teamObj || getTeamById(q.id)).filter(t => t);
}

function createOfficialPairings(qualifiers) {
    const pairings = [];
    const shuffled = [...qualifiers];
    
    for (let i = 0; i < shuffled.length; i += 2) {
        if (shuffled[i] && shuffled[i + 1]) {
            pairings.push({
                id: `R32_${pairings.length}`,
                home: shuffled[i],
                away: shuffled[i + 1],
                homeScore: 0,
                awayScore: 0,
                played: false,
                winner: null,
                isLegit: false
            });
        }
    }
    
    return pairings.slice(0, 16);
}

// Sync bracket with API matches and protect legit results
function syncBracketWithAPIMatches() {
    console.log("Syncing bracket with API match results...");
    
    // Check for knockout matches in API
    const knockoutAPIMatches = matchesData.filter(m => 
        m.type === 'knockout' || m.round === 'R32' || m.round === 'R16' || 
        m.round === 'QF' || m.round === 'SF' || m.round === 'FINAL' || m.round === '3rd'
    );
    
    knockoutAPIMatches.forEach(apiMatch => {
        if (apiMatch.home_score !== undefined && apiMatch.away_score !== undefined) {
            const matchId = `${apiMatch.home_team_id}_${apiMatch.away_team_id}`;
            
            // Check all rounds for this match
            const allRounds = [
                ...knockoutState.round32,
                ...knockoutState.round16,
                ...knockoutState.quarterfinals,
                ...knockoutState.semifinals
            ];
            
            if (knockoutState.final) allRounds.push(knockoutState.final);
            if (knockoutState.thirdPlace) allRounds.push(knockoutState.thirdPlace);
            
            const existingMatch = allRounds.find(m => 
                (m.home?.id == apiMatch.home_team_id && m.away?.id == apiMatch.away_team_id) ||
                (m.home?.id == apiMatch.away_team_id && m.away?.id == apiMatch.home_team_id)
            );
            
            if (existingMatch && !existingMatch.isLegit) {
                existingMatch.homeScore = apiMatch.home_score;
                existingMatch.awayScore = apiMatch.away_score;
                existingMatch.played = true;
                existingMatch.isLegit = true;
                existingMatch.winner = apiMatch.home_score > apiMatch.away_score ? existingMatch.home : existingMatch.away;
                
                if (apiMatch.home_score === apiMatch.away_score && apiMatch.penalty_winner) {
                    existingMatch.winner = apiMatch.penalty_winner == apiMatch.home_team_id ? existingMatch.home : existingMatch.away;
                }
                
                legitMatchResults.add(matchId);
                console.log(`Protected legit result: ${existingMatch.home?.name_en} vs ${existingMatch.away?.name_en}`);
            }
        }
    });
    
    // Auto-advance based on legit results
    autoAdvanceFromLegitResults();
    renderKnockoutBracket();
}

function autoAdvanceFromLegitResults() {
    // Advance Round of 32 to Round of 16
    if (knockoutState.round32.length > 0 && knockoutState.round32.every(m => m.played) && knockoutState.round16.length === 0) {
        knockoutState.round16 = advanceToNextRoundProtected(knockoutState.round32, 'R16');
    }
    
    // Advance Round of 16 to Quarterfinals
    if (knockoutState.round16.length > 0 && knockoutState.round16.every(m => m.played) && knockoutState.quarterfinals.length === 0) {
        knockoutState.quarterfinals = advanceToNextRoundProtected(knockoutState.round16, 'QF');
    }
    
    // Advance Quarterfinals to Semifinals
    if (knockoutState.quarterfinals.length > 0 && knockoutState.quarterfinals.every(m => m.played) && knockoutState.semifinals.length === 0) {
        knockoutState.semifinals = advanceToNextRoundProtected(knockoutState.quarterfinals, 'SF');
    }
    
    // Advance Semifinals to Final
    if (knockoutState.semifinals.length > 0 && knockoutState.semifinals.every(m => m.played) && !knockoutState.final) {
        const finalists = knockoutState.semifinals.map(m => m.winner).filter(w => w);
        if (finalists.length >= 2) {
            knockoutState.final = {
                id: 'FINAL',
                home: finalists[0],
                away: finalists[1],
                homeScore: 0,
                awayScore: 0,
                played: false,
                winner: null,
                isLegit: false
            };
        }
    }
    
    // Third place match
    if (knockoutState.semifinals.length > 0 && knockoutState.semifinals.every(m => m.played) && !knockoutState.thirdPlace) {
        const losers = knockoutState.semifinals.map(m => {
            return m.winner === m.home ? m.away : m.home;
        }).filter(l => l);
        if (losers.length >= 2) {
            knockoutState.thirdPlace = {
                id: '3RD',
                home: losers[0],
                away: losers[1],
                homeScore: 0,
                awayScore: 0,
                played: false,
                winner: null,
                isLegit: false
            };
        }
    }
}

function advanceToNextRoundProtected(matches, roundName) {
    const winners = matches.map(m => m.winner).filter(w => w);
    const nextMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
        if (winners[i] && winners[i+1]) {
            nextMatches.push({
                id: `${roundName}_${i/2}`,
                home: winners[i],
                away: winners[i+1],
                homeScore: 0,
                awayScore: 0,
                played: false,
                winner: null,
                isLegit: false
            });
        }
    }
    return nextMatches;
}

// Reset ONLY unplayed/non-legit matches
function resetOnlyUnplayedMatches() {
    console.log("Resetting only unplayed/non-legit matches...");
    
    // Reset Round of 32 (only non-legit ones)
    knockoutState.round32 = knockoutState.round32.map(match => {
        if (!match.isLegit) {
            return {
                ...match,
                homeScore: 0,
                awayScore: 0,
                played: false,
                winner: null
            };
        }
        return match;
    });
    
    // Clear all subsequent rounds that aren't legit
    knockoutState.round16 = knockoutState.round16.filter(m => m.isLegit);
    knockoutState.quarterfinals = knockoutState.quarterfinals.filter(m => m.isLegit);
    knockoutState.semifinals = knockoutState.semifinals.filter(m => m.isLegit);
    
    if (knockoutState.final && !knockoutState.final.isLegit) {
        knockoutState.final = null;
    }
    if (knockoutState.thirdPlace && !knockoutState.thirdPlace.isLegit) {
        knockoutState.thirdPlace = null;
    }
    
    if (!knockoutState.final) knockoutState.winner = null;
    
    renderKnockoutBracket();
    console.log("Unplayed matches reset. Legit results preserved.");
}

// Simulate ONLY unplayed/non-legit matches
function simulateOnlyUnplayedMatches() {
    console.log("Simulating only unplayed/non-legit matches...");
    
    // Simulate unplayed Round of 32 matches
    let hasUnplayedR32 = false;
    knockoutState.round32 = knockoutState.round32.map(m => {
        if (!m.played && !m.isLegit) {
            hasUnplayedR32 = true;
            return simulateMatchProtected(m);
        }
        return m;
    });
    
    // If R32 just got played, advance
    if (hasUnplayedR32 && knockoutState.round32.every(m => m.played) && knockoutState.round16.length === 0) {
        knockoutState.round16 = advanceToNextRoundProtected(knockoutState.round32, 'R16');
    }
    
    // Simulate Round of 16
    let hasUnplayedR16 = false;
    if (knockoutState.round16.length > 0) {
        knockoutState.round16 = knockoutState.round16.map(m => {
            if (!m.played && !m.isLegit) {
                hasUnplayedR16 = true;
                return simulateMatchProtected(m);
            }
            return m;
        });
        
        if (hasUnplayedR16 && knockoutState.round16.every(m => m.played) && knockoutState.quarterfinals.length === 0) {
            knockoutState.quarterfinals = advanceToNextRoundProtected(knockoutState.round16, 'QF');
        }
    }
    
    // Simulate Quarterfinals
    let hasUnplayedQF = false;
    if (knockoutState.quarterfinals.length > 0) {
        knockoutState.quarterfinals = knockoutState.quarterfinals.map(m => {
            if (!m.played && !m.isLegit) {
                hasUnplayedQF = true;
                return simulateMatchProtected(m);
            }
            return m;
        });
        
        if (hasUnplayedQF && knockoutState.quarterfinals.every(m => m.played) && knockoutState.semifinals.length === 0) {
            knockoutState.semifinals = advanceToNextRoundProtected(knockoutState.quarterfinals, 'SF');
        }
    }
    
    // Simulate Semifinals
    let hasUnplayedSF = false;
    if (knockoutState.semifinals.length > 0) {
        knockoutState.semifinals = knockoutState.semifinals.map(m => {
            if (!m.played && !m.isLegit) {
                hasUnplayedSF = true;
                return simulateMatchProtected(m);
            }
            return m;
        });
        
        if (hasUnplayedSF && knockoutState.semifinals.every(m => m.played)) {
            const finalists = knockoutState.semifinals.map(m => m.winner).filter(w => w);
            if (finalists.length >= 2 && !knockoutState.final) {
                knockoutState.final = {
                    id: 'FINAL',
                    home: finalists[0],
                    away: finalists[1],
                    homeScore: 0,
                    awayScore: 0,
                    played: false,
                    winner: null,
                    isLegit: false
                };
            }
            
            const losers = knockoutState.semifinals.map(m => {
                return m.winner === m.home ? m.away : m.home;
            }).filter(l => l);
            if (losers.length >= 2 && !knockoutState.thirdPlace) {
                knockoutState.thirdPlace = {
                    id: '3RD',
                    home: losers[0],
                    away: losers[1],
                    homeScore: 0,
                    awayScore: 0,
                    played: false,
                    winner: null,
                    isLegit: false
                };
            }
        }
    }
    
    // Simulate Final
    if (knockoutState.final && !knockoutState.final.played && !knockoutState.final.isLegit) {
        const finalWinner = simulateMatchProtected(knockoutState.final);
        knockoutState.winner = finalWinner.winner;
    }
    
    // Simulate Third Place
    if (knockoutState.thirdPlace && !knockoutState.thirdPlace.played && !knockoutState.thirdPlace.isLegit) {
        simulateMatchProtected(knockoutState.thirdPlace);
    }
    
    renderKnockoutBracket();
    console.log("Unplayed matches simulated. Legit results unchanged.");
}

function simulateMatchProtected(match) {
    if (match.played || match.isLegit) return match;
    
    const totalGoals = Math.floor(Math.random() * 5) + 1;
    const homeGoals = Math.floor(Math.random() * (totalGoals + 1));
    const awayGoals = totalGoals - homeGoals;
    match.homeScore = homeGoals;
    match.awayScore = awayGoals;
    match.played = true;
    match.winner = homeGoals > awayGoals ? match.home : (awayGoals > homeGoals ? match.away : (Math.random() > 0.5 ? match.home : match.away));
    
    if (homeGoals === awayGoals) {
        match.winner = Math.random() > 0.5 ? match.home : match.away;
        match.homeScore += 1;
    }
    
    return match;
}

function renderKnockoutBracket() {
    const container = document.getElementById('knockout-bracket');
    if (!container) return;
    
    const renderMatch = (match, isFinal = false) => {
        if (!match) return `<div class="bracket-match">TBD</div>`;
        const homeName = match.home?.name_en || 'TBD';
        const awayName = match.away?.name_en || 'TBD';
        const homeFlag = match.home ? getFlag(match.home.id) : '';
        const awayFlag = match.away ? getFlag(match.away.id) : '';
        const score = match.played ? `${match.homeScore} - ${match.awayScore}` : 'VS';
        const legitBadge = match.isLegit ? '<span style="font-size: 8px; color: #10b981; margin-left: 5px;">✓</span>' : '';
        
        return `<div class="bracket-match ${isFinal ? 'final-match' : ''}" onclick='showKnockoutMatch(${JSON.stringify(match).replace(/'/g, "&#39;")})'>
            <div class="match-teams">
                <div class="match-team"><img src="${homeFlag}" onerror="this.style.display='none'"> <span>${homeName}${match.isLegit && match.winner === match.home ? legitBadge : ''}</span></div>
                <div class="match-score">${score}</div>
                <div class="match-team"><img src="${awayFlag}" onerror="this.style.display='none'"> <span>${awayName}${match.isLegit && match.winner === match.away ? legitBadge : ''}</span></div>
            </div>
            ${match.isLegit ? '<div style="font-size: 8px; color: #10b981; text-align: center; margin-top: 4px;">OFFICIAL RESULT</div>' : ''}
        </div>`;
    };
    
    let championHtml = '';
    if (knockoutState.winner) {
        const isLegitChampion = knockoutState.final?.isLegit;
        championHtml = ``;
    }
    
    const html = `<div class="bracket-container">
        <div class="bracket-round"><div class="round-title">ROUND OF 32</div>${knockoutState.round32.map(m => renderMatch(m)).join('')}</div>
        <div class="bracket-round"><div class="round-title">ROUND OF 16</div>${knockoutState.round16.length ? knockoutState.round16.map(m => renderMatch(m)).join('') : '<div class="bracket-match">-</div>'}</div>
        <div class="bracket-round"><div class="round-title">QUARTERFINALS</div>${knockoutState.quarterfinals.length ? knockoutState.quarterfinals.map(m => renderMatch(m)).join('') : '<div class="bracket-match">-</div>'}</div>
        <div class="bracket-round"><div class="round-title">SEMIFINALS</div>${knockoutState.semifinals.length ? knockoutState.semifinals.map(m => renderMatch(m)).join('') : '<div class="bracket-match">-</div>'}</div>
        <div class="bracket-round"><div class="round-title">FINAL</div>${knockoutState.final ? renderMatch(knockoutState.final, true) : '<div class="bracket-match">-</div>'}</div>
    </div>${championHtml}`;
    container.innerHTML = html;
}

window.showKnockoutMatch = function(matchData) {
    if (!matchData.home && !matchData.away) return;
    const home = matchData.home;
    const away = matchData.away;
    const modal = document.getElementById('matchModal');
    const body = document.getElementById('modalBody');
    const isLegit = matchData.isLegit;
    
    body.innerHTML = `<div style="text-align:center">
        <img src="${home ? getFlag(home.id) : ''}" width="80" style="margin:10px">
        <span style="font-size:32px; margin:0 20px; font-weight:900">${matchData.played ? matchData.homeScore + ':' + matchData.awayScore : 'VS'}</span>
        <img src="${away ? getFlag(away.id) : ''}" width="80" style="margin:10px">
        <h3 style="margin-top:20px">${home?.name_en || 'TBD'} vs ${away?.name_en || 'TBD'}</h3>
        <p style="color:#c8102e; margin-top:10px">Knockout Stage Match</p>
        ${isLegit ? '<p style="color:#10b981; margin-top:5px; font-size:12px;">✓ OFFICIAL FIFA RESULT ✓</p>' : '<p style="color:#f59e0b; margin-top:5px; font-size:12px;">⚠ SIMULATED RESULT ⚠</p>'}
    </div>`;
    modal.style.display = 'flex';
};

function initMobileSidebar() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('mobileSidebar');
    const closeBtn = document.getElementById('sidebarClose');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
    
    if (!menuBtn || !sidebar) return;
    
    function openSidebar() {
        sidebar.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    function closeSidebar() {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    menuBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
    
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (targetId && targetId !== '#') {
                e.preventDefault();
                closeSidebar();
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById("matchModal");
    const closeBtn = document.getElementById("closeModal");
    
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = "none";
            const watermarkDiv = document.querySelector(".modal-watermark");
            if (watermarkDiv) watermarkDiv.style.backgroundImage = "";
        };
    }
    
    window.onclick = function(event) {
        if (event.target === modal || (event.target.classList && event.target.classList.contains('modal-overlay'))) {
            modal.style.display = "none";
            const watermarkDiv = document.querySelector(".modal-watermark");
            if (watermarkDiv) watermarkDiv.style.backgroundImage = "";
        }
    };
    
    initializeWebsite();
});