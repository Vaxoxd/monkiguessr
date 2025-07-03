var panorama, guessMap, timerInterval;
var guessMarker = null, realMarker = null, guessLine = null;
var currentLocation = null, mapLocked = false;
var timeLeft = 120;
var totalPoints = 0;

// System efektów i boosterów
var activeEffects = {
  doublePoints: false,
  extraTime: false,
  continentHint: false
};

var inventory = {
  goldenCrown: false,
  aimingReticle: false,
  starPin: false,
  certificate: false,
  bronzeMedal: false,
  masterMedal: false
};

// System multiplayer
var multiplayerState = {
  isMultiplayer: false,
  isHost: false,
  roomCode: null,
  myScore: 0,
  opponentScore: 0,
  opponentName: 'Przeciwnik',
  myGuess: null,
  opponentGuess: null,
  currentRound: 1,
  maxRounds: 3,
  gameEnded: false,
  socket: null,
  isRealMultiplayer: false,
  players: []
};

var multiplayerStats = {
  wins: parseInt(localStorage.getItem('mp-wins') || '0'),
  losses: parseInt(localStorage.getItem('mp-losses') || '0'),
  points: parseInt(localStorage.getItem('mp-points') || '0')
};

// System autoryzacji
var currentUser = null;
var authMode = 'login';

// System dźwięków
var soundSystem = {
  enabled: true,
  sounds: {
    click: null,
    success: null,
    error: null,
    notification: null,
    timer: null,
    victory: null,
    defeat: null,
    coin: null
  },
  
  init: function() {
    // Utwórz kontekst audio
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.createSounds();
    } catch (e) {
      console.log('Audio nie jest dostępne:', e);
      this.enabled = false;
    }
  },
  
  createSounds: function() {
    // Kliknięcie przycisku
    this.sounds.click = this.createBeep(800, 0.1, 'square');
    
    // Sukces
    this.sounds.success = this.createMelody([523, 659, 784], [0.15, 0.15, 0.3]);
    
    // Błąd
    this.sounds.error = this.createMelody([392, 330, 262], [0.2, 0.2, 0.4]);
    
    // Powiadomienie
    this.sounds.notification = this.createMelody([659, 784], [0.1, 0.2]);
    
    // Timer warning
    this.sounds.timer = this.createBeep(440, 0.1, 'triangle');
    
    // Zwycięstwo
    this.sounds.victory = this.createMelody([523, 659, 784, 1047], [0.2, 0.2, 0.2, 0.4]);
    
    // Porażka
    this.sounds.defeat = this.createMelody([330, 294, 262, 220], [0.3, 0.3, 0.3, 0.5]);
    
    // Monety/punkty
    this.sounds.coin = this.createMelody([784, 1047], [0.1, 0.15]);
  },
  
  createBeep: function(frequency, duration, type = 'sine') {
    if (!this.enabled || !this.audioContext) return null;
    
    return () => {
      try {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
      } catch (e) {
        console.log('Błąd odtwarzania dźwięku:', e);
      }
    };
  },
  
  createMelody: function(frequencies, durations) {
    if (!this.enabled || !this.audioContext) return null;
    
    return () => {
      try {
        let currentTime = this.audioContext.currentTime;
        
        frequencies.forEach((frequency, index) => {
          const oscillator = this.audioContext.createOscillator();
          const gainNode = this.audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(this.audioContext.destination);
          
          oscillator.frequency.value = frequency;
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.2, currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + durations[index]);
          
          oscillator.start(currentTime);
          oscillator.stop(currentTime + durations[index]);
          
          currentTime += durations[index];
        });
      } catch (e) {
        console.log('Błąd odtwarzania melodii:', e);
      }
    };
  },
  
  play: function(soundName) {
    if (!this.enabled || !userPreferences.soundEffects) return;
    
    const sound = this.sounds[soundName];
    if (sound && typeof sound === 'function') {
      sound();
    }
  },
  
  playClick: function() { this.play('click'); },
  playSuccess: function() { this.play('success'); },
  playError: function() { this.play('error'); },
  playNotification: function() { this.play('notification'); },
  playTimer: function() { this.play('timer'); },
  playVictory: function() { this.play('victory'); },
  playDefeat: function() { this.play('defeat'); },
  playCoin: function() { this.play('coin'); }
};

// System poziomów i doświadczenia
var playerLevel = {
  level: 1,
  exp: 0,
  expToNext: 100
};

function calculateLevel(totalExp) {
  let level = 1;
  let expNeeded = 100;
  let currentExp = totalExp;
  
  while (currentExp >= expNeeded) {
    currentExp -= expNeeded;
    level++;
    expNeeded = Math.floor(expNeeded * 1.5); // Każdy poziom wymaga 50% więcej EXP
  }
  
  return {
    level: level,
    exp: currentExp,
    expToNext: expNeeded
  };
}

function addExperience(expGained) {
  if (!currentUser) return;
  
  const oldLevel = playerLevel.level;
  currentUser.totalExp = (currentUser.totalExp || 0) + expGained;
  
  playerLevel = calculateLevel(currentUser.totalExp);
  
  // Sprawdź czy awansowałeś
  if (playerLevel.level > oldLevel) {
    showLevelUpNotification(oldLevel, playerLevel.level);
  }
  
  updateLevelDisplay();
  
  // Zapisz EXP na serwerze
  if (currentUser) {
    updateUserExp(currentUser.username, expGained);
  }
}

// System znajomych
var friendsData = {
  friends: [],
  pendingInvitations: [],
  sentInvitations: []
};

var friendsCurrentTab = 'friends';

// Sprawdź czy użytkownik jest zalogowany przy starcie
function checkAuthOnLoad() {
  const savedUser = localStorage.getItem('monkiguessr-user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      showUserInterface();
    } catch (e) {
      localStorage.removeItem('monkiguessr-user');
      showAuthModal();
    }
  } else {
    showAuthModal();
  }
}

function showAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('main-menu').style.pointerEvents = 'none';
  document.getElementById('main-menu').style.filter = 'blur(5px)';
}

function hideAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('main-menu').style.pointerEvents = 'auto';
  document.getElementById('main-menu').style.filter = 'none';
}

function showUserInterface() {
  if (currentUser) {
    document.getElementById('current-username').textContent = currentUser.username;
    document.getElementById('user-total-points').textContent = currentUser.totalPoints.toLocaleString();
    document.getElementById('user-games-played').textContent = currentUser.gamesPlayed;
    document.getElementById('user-info').style.display = 'block';
    document.getElementById('logout-button').style.display = 'inline-block';
    document.getElementById('settings-button').style.display = 'inline-block';
    
    // Pokaż przycisk instalacji jeśli dostępny i nie zainstalowano
    if (deferredPrompt && !isAppInstalled) {
      document.getElementById('install-button').style.display = 'inline-block';
    }
    
    // Załaduj punkty użytkownika i synchronizuj z totalPoints
    totalPoints = currentUser.totalPoints || 0;
    updateTotalPointsDisplay();
    
    // Inicjalizuj system poziomów
    currentUser.totalExp = currentUser.totalExp || 0;
    playerLevel = calculateLevel(currentUser.totalExp);
    updateLevelDisplay();
    
    // Załaduj awatar użytkownika
    loadUserAvatar();
    
    // Załaduj statystyki multiplayer
    loadMultiplayerStats();
  }
  hideAuthModal();
}

function switchAuthTab(mode) {
  authMode = mode;
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(tab => tab.classList.remove('active'));
  
  if (mode === 'login') {
    tabs[0].classList.add('active');
    document.getElementById('auth-title').textContent = '🎮 Zaloguj się do MońkiGuessr';
    document.getElementById('auth-submit').textContent = '🎯 Zaloguj się';
    document.getElementById('confirm-password-group').style.display = 'none';
    document.getElementById('auth-switch-text').innerHTML = 'Nie masz konta? <a href="#" onclick="switchAuthTab(\'register\')">Zarejestruj się</a>';
  } else {
    tabs[1].classList.add('active');
    document.getElementById('auth-title').textContent = '🚀 Stwórz konto MońkiGuessr';
    document.getElementById('auth-submit').textContent = '🎯 Zarejestruj się';
    document.getElementById('confirm-password-group').style.display = 'block';
    document.getElementById('auth-switch-text').innerHTML = 'Masz już konto? <a href="#" onclick="switchAuthTab(\'login\')">Zaloguj się</a>';
  }
  
  // Wyczyść komunikat
  showAuthMessage('', 'clear');
  document.getElementById('auth-form').reset();
}

function showAuthMessage(message, type) {
  const messageEl = document.getElementById('auth-message');
  messageEl.textContent = message;
  messageEl.className = 'auth-message';
  if (type) {
    messageEl.classList.add(type);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirmPassword = document.getElementById('auth-confirm-password').value;
  
  // Walidacja
  if (username.length < 3) {
    showAuthMessage('Nazwa użytkownika musi mieć co najmniej 3 znaki!', 'error');
    return;
  }
  
  if (password.length < 4) {
    showAuthMessage('Hasło musi mieć co najmniej 4 znaki!', 'error');
    return;
  }
  
  if (authMode === 'register' && password !== confirmPassword) {
    showAuthMessage('Hasła nie są identyczne!', 'error');
    return;
  }
  
  const submitButton = document.getElementById('auth-submit');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = authMode === 'login' ? '🔄 Logowanie...' : '🔄 Rejestracja...';
  
  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      if (authMode === 'register') {
        showAuthMessage('Konto utworzone! Możesz się teraz zalogować.', 'success');
        setTimeout(() => {
          switchAuthTab('login');
          document.getElementById('auth-username').value = username;
        }, 2000);
      } else {
        currentUser = data.user;
        localStorage.setItem('monkiguessr-user', JSON.stringify(currentUser));
        showAuthMessage('Zalogowano pomyślnie!', 'success');
        setTimeout(() => {
          showUserInterface();
        }, 1000);
      }
    } else {
      showAuthMessage(data.message, 'error');
    }
  } catch (error) {
    showAuthMessage('Błąd połączenia z serwerem!', 'error');
    console.error('Auth error:', error);
  }
  
  submitButton.disabled = false;
  submitButton.textContent = originalText;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('monkiguessr-user');
  
  // Resetuj interfejs
  document.getElementById('user-info').style.display = 'none';
  document.getElementById('logout-button').style.display = 'none';
  document.getElementById('settings-button').style.display = 'none';
  
  // Resetuj punkty
  totalPoints = 0;
  updateTotalPointsDisplay();
  
  // Pokaż okno logowania
  showAuthModal();
  switchAuthTab('login');
  
  showBattleNotification("👋 Wylogowano", "Do zobaczenia!");
}

async function updateUserStats(points, gameResult) {
  if (!currentUser) return;
  
  try {
    const response = await fetch('/api/update-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: currentUser.username,
        points: points,
        gameResult: gameResult
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('monkiguessr-user', JSON.stringify(currentUser));
      
      // Zaktualizuj interfejs
      document.getElementById('user-total-points').textContent = currentUser.totalPoints.toLocaleString();
      document.getElementById('user-games-played').textContent = currentUser.gamesPlayed;
      
      totalPoints = currentUser.totalPoints;
      updateTotalPointsDisplay();
    }
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

async function updateUserExp(username, expGained) {
  try {
    const response = await fetch('/api/update-exp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        exp: expGained
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentUser.totalExp = data.user.totalExp;
      localStorage.setItem('monkiguessr-user', JSON.stringify(currentUser));
    }
  } catch (error) {
    console.error('Error updating user exp:', error);
  }
}

// System localStorage dla punktów (zachowano dla kompatybilności)
function loadTotalPoints() {
  if (currentUser) {
    totalPoints = currentUser.totalPoints || 0;
    return totalPoints;
  }
  const saved = localStorage.getItem('monkiguessr-points');
  totalPoints = saved ? parseInt(saved) : 0;
  return totalPoints;
}

function saveTotalPoints() {
  if (currentUser) {
    // Punkty są zapisywane przez updateUserStats
    return;
  }
  localStorage.setItem('monkiguessr-points', totalPoints.toString());
}

// Inicjalizacja przy starcie
document.addEventListener('DOMContentLoaded', function() {
  checkAuthOnLoad();
  
  // Dodaj event listener do formularza autoryzacji
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
  
  // PWA Installation events
  setupPWAInstallation();
  
  // Załaduj dane znajomych
  loadFriendsData();
  
  // Synchronizuj awatary przy starcie
  syncAvatarsOnStart();
  
  // Inicjalizuj system dźwięków
  soundSystem.init();
  
  // Dodaj dźwięki do przycisków w menu głównym
  addSoundEffectsToButtons();
  
  // Połącz się z WebSocket dla synchronizacji globalnej
  setTimeout(() => {
    connectToGlobalWebSocket();
  }, 2000);
});

// Załaduj inwentarz przy starcie
inventory = loadInventory();

var randomLocations = [
  { lat: 55.6604639, lng: 12.5926069 },   // Dania
  { lat: 56.8819076, lng: 14.8004662 },   // Szwecja
  { lat: 53.3499562, lng: -6.2604593 },   // Dublin, Irlandia
  { lat: 60.9071271, lng: -46.047203 },   // Grenlandia
  { lat: -77.8002949, lng: 166.7775846 }, // Antarktyda
  { lat: 24.242186, lng: 87.2854271 },    // Bangladesz
  { lat: 25.0676256, lng: 34.8789697 },   // Egipt
  { lat: 35.9524322, lng: 14.411507 },    // Malta
  { lat: 42.5648793, lng: 27.5185309 },   // Bułgaria
  { lat: 43.2375755, lng: 27.8256665 },   // Bułgaria
  { lat: 47.5402223, lng: 7.6169753 },    // Szwajcaria
  { lat: 51.0909755, lng: 23.2817688 },   // Polska - Chełm
  { lat: 51.0544341, lng: 23.3158529 },   // Polska - Chełm okolice
  { lat: 50.0524666, lng: 19.9458015 },   // Polska - Kraków
  { lat: 50.0628077, lng: 19.8388003 },   // Polska - Kraków
  { lat: 49.8832635, lng: 19.4918946 },   // Polska - Nowy Targ
  { lat: 51.1089611, lng: 17.0334601 },   // Polska - Wrocław
  { lat: 52.5430373, lng: 16.9482394 },   // Polska - Poznań
  { lat: 52.2534696, lng: 15.5182328 },   // Polska - Gorzów Wielkopolski
  { lat: 52.2100871, lng: 18.296856 },    // Polska - Turek
  { lat: 51.5316371, lng: 20.0081262 },   // Polska - Radom
  { lat: 52.2324898, lng: 21.0099867 },   // Polska - Warszawa
  { lat: 52.4294699, lng: 20.7242181 },   // Polska - okolice Warszawy
  { lat: 53.1330035, lng: 23.1680317 },   // Polska - Białystok
  { lat: 53.7263612, lng: 18.9325915 },   // Polska - Kwiatkowo
  { lat: 54.3336316, lng: 16.5499757 },   // Polska - Słupsk
  { lat: 54.2127298, lng: 19.1161106 },   // Polska - Malbork
  { lat: 54.0914481, lng: 18.7771661 },   // Polska - Pruszcz Gdański
  { lat: 54.2937251, lng: 18.5370105 },   // Polska - Gdynia
  { lat: 54.5773784, lng: 18.4630295 },   // Polska - Hel
  { lat: 54.6062724, lng: 18.8009414 },   // Polska - Nowy Dwór Gdański
  { lat: 52.4459301444923, lng: 20.666284299059825 }, // Moniek
  { lat: 52.4291366, lng: 20.7234988 },
  { lat: 52.4176826, lng: 20.7425582 },
  { lat: 52.444639, lng: 20.6539047 },
  { lat: 52.2552493, lng: 20.982759 },
  { lat: 52.2333713, lng: 21.0097472 },
  { lat: 52.2284073, lng: 21.0017631 },
  { lat: 52.308832, lng: 20.9179362 },
  { lat: 53.1323733, lng: 23.1469117 },
  { lat: 52.8807062, lng: 18.791775 },
  { lat: 51.1359413, lng: 23.4670923 },
  { lat: 51.4098013, lng: 19.7012092 },
  { lat: 51.530574, lng: 20.0094335 },
  { lat: 51.4061469, lng: 21.1498058 },
  { lat: 52.1711038, lng: 20.9739932 },
  { lat: 51.095629, lng: 17.0373478 },
  { lat: 50.0539612, lng: 19.9392617 },
  { lat: 50.0151741, lng: 20.9920972 },
  { lat: 52.4055111, lng: 16.9375314 },
  { lat: 51.7777443, lng: 19.4655807 },
  { lat: 52.2552493, lng: 20.982759 },
  { lat: 52.2333713, lng: 21.0097472 },
  { lat: 52.2284073, lng: 21.0017631 },
  { lat: 52.308832,  lng: 20.9179362 },
  { lat: 53.1323733, lng: 23.1469117 },
  { lat: 52.8807062, lng: 18.791775 },
  { lat: 51.1359413, lng: 23.4670923 },
  { lat: 51.4098013, lng: 19.7012092 },
  { lat: 51.530574,  lng: 20.0094335 },
  { lat: 51.4061469, lng: 21.1498058 },
  { lat: 52.1711038, lng: 20.9739932 },
  { lat: 51.095629,  lng: 17.0373478 },
  { lat: 50.0539612, lng: 19.9392617 },
  { lat: 50.0151741, lng: 20.9920972 },
  { lat: 52.4055111, lng: 16.9375314 },
  { lat: 51.7777443, lng: 19.4655807 },
  { lat: 52.2376752, lng: 21.0434863 },
  { lat: 53.1490103, lng: 22.9884382 },
  { lat: 53.516449,  lng: 23.6523759 },
  { lat: 54.3206185, lng: 21.6490261 },
  { lat: 53.736399,  lng: 18.9211854 },
  { lat: 50.6685432, lng: 17.9219608 },
  { lat: 50.030661,  lng: 19.1985765 },
  { lat: 52.600658,  lng: 21.4505882 },
  { lat: 53.0181596, lng: 20.8803146 },
  { lat: 52.266399,  lng: 18.2520667 },
  { lat: 51.3862859, lng: 19.6830344 },
  { lat: 52.460175,  lng: 21.0245561 },
  { lat: 53.1119634, lng: 20.3750694 },
  { lat: 53.1760493, lng: 22.0611224 },
  { lat: 52.0807023, lng: 21.02528 },
  { lat: 50.7176234, lng: 23.2713948 },
];

function initMaps() {
  // Inicjalizacja map tylko gdy API jest gotowe - nie startujemy gry od razu
  console.log("Google Maps API załadowane");
}

function startGame() {
  try {
    // Ukryj menu i pokaż grę
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("game-container").style.display = "block";

    // Pokaż przycisk sklepu w trybie solo
    document.getElementById("shop-button-game").style.display = "flex";

    // Sprawdź czy Google Maps API jest dostępne
    if (typeof google === 'undefined' || !google.maps) {
      showBattleNotification("❌ Błąd!", "Google Maps nie jest załadowane. Odśwież stronę.");
      showMainMenu();
      return;
    }

    // Inicjalizuj mapę
    guessMap = new google.maps.Map(document.getElementById("guess-map"), {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
    });

  // Ustaw odpowiedni kursor na mapie
  const mapDiv = document.getElementById("guess-map");
  if (inventory.aimingReticle) {
    setupCustomCrosshair(mapDiv);
  } else {
    mapDiv.style.cursor = "crosshair";
  }

  // Pokaż błyszczącą naklejkę star pin jeśli jest w inwentarzu
  updateStarPinSticker();

  guessMap.addListener("click", (e) => {
    if (mapLocked) return;
    placeGuessMarker(e.latLng);
  });

  // Dodaj niestandardową kontrolkę toggle
  const toggleButton = document.createElement('div');
  toggleButton.innerHTML = '⛶';
  toggleButton.style.cssText = `
    background: rgba(255, 255, 255, 0.95);
    border: 2px solid #333;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    margin: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    user-select: none;
  `;

  toggleButton.addEventListener('click', () => {
    const guessMapDiv = document.getElementById('guess-map');
    if (guessMapDiv.classList.contains('expanded')) {
      guessMapDiv.classList.remove('expanded');
    } else {
      guessMapDiv.classList.add('expanded');
    }
    google.maps.event.trigger(guessMap, 'resize');
  });

  // Dodaj przycisk do lewego górnego rogu mapy
  guessMap.controls[google.maps.ControlPosition.TOP_LEFT].push(toggleButton);

  startRound();
}

function updateTotalPointsDisplay() {
  try {
    const totalPointsElement = document.getElementById("total-points");
    if (totalPointsElement) {
      totalPointsElement.textContent = `🏆 ${totalPoints.toLocaleString()}`;
    }
    saveTotalPoints();
  } catch (error) {
    console.error('Błąd aktualizacji punktów:', error);
  }
}

function updateLevelDisplay() {
  const levelElement = document.getElementById("player-level");
  if (levelElement) {
    levelElement.innerHTML = `
      <div class="level-star">⭐</div>
      <div class="level-number">${playerLevel.level}</div>
    `;
  }
  
  const expElement = document.getElementById("player-exp");
  if (expElement) {
    const expPercent = (playerLevel.exp / playerLevel.expToNext) * 100;
    expElement.innerHTML = `
      <div class="exp-bar-wrapper">
        <div class="exp-bar" style="width: ${expPercent}%"></div>
      </div>
      <div class="exp-text">EXP: ${playerLevel.exp}/${playerLevel.expToNext}</div>
    `;
  }
}

function showLevelUpNotification(oldLevel, newLevel) {
  const notificationData = {
    type: 'levelup',
    html: `
      <div class="notification-icon">🎉</div>
      <div class="notification-text">
        <div class="notification-title">AWANS!</div>
        <div class="notification-desc">Poziom ${oldLevel} → ${newLevel}</div>
        <div class="notification-detail">Gratulacje! Osiągnąłeś nowy poziom!</div>
      </div>
    `
  };

  queueNotification(notificationData);
  
  // Dodatkowa animacja poziomu
  const levelElement = document.getElementById("player-level");
  if (levelElement) {
    levelElement.classList.add('level-up-animation');
    setTimeout(() => {
      levelElement.classList.remove('level-up-animation');
    }, 2000);
  }
}

function showMainMenu() {
  // Zatrzymaj timer
  clearInterval(timerInterval);

  // Ukryj wszystko i pokaż menu
  document.getElementById("game-container").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
  document.getElementById("shop").style.display = "none";
  document.getElementById("multiplayer").style.display = "none";
  document.getElementById("mp-scoreboard").style.display = "none";

  // Pokaż przycisk sklepu (na wszelki wypadek)
  document.getElementById("shop-button-game").style.display = "flex";

  // Zresetuj stan gry
  mapLocked = false;
  timeLeft = 120;
  multiplayerState.isMultiplayer = false;
  multiplayerState.isHost = false;
  multiplayerState.roomCode = null;

  // Usuń custom celownik
  removeCustomCrosshair();

  // Pokaż złotą koronę jeśli jest w inwentarzu
  updateGoldenCrownDisplay();
  // NIE resetuj totalPoints - zachowaj je!
}



function startRound() {
  try {
    mapLocked = false;
    const resultBox = document.getElementById("result-box");
    const resultOverlay = document.getElementById("result-overlay");
    if (resultBox) {
      resultBox.classList.remove('show', 'game-over');
      resultBox.style.display = "none";
    }
    if (resultOverlay) {
      resultOverlay.classList.remove('show');
      resultOverlay.style.display = "none";
    }
    
    const nextButton = document.getElementById("next-button");
    const guessButton = document.getElementById("guess-button");
    const instruction = document.getElementById("instruction");
    
    if (nextButton) nextButton.style.display = "none";
    if (guessButton) guessButton.style.display = "block";
    if (instruction) {
      instruction.style.display = "block";
      instruction.innerText = "Kliknij na mapie, aby zaznaczyć swoją lokalizację!";
    }
    
    resetMarkers();

    // Przywróć kontrolki mapy
    if (guessMap) {
      guessMap.setOptions({
        draggable: true,
        zoomControl: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        keyboardShortcuts: true
      });
    }

    currentLocation = randomLocations[Math.floor(Math.random() * randomLocations.length)];

    if (typeof google === 'undefined' || !google.maps) {
      showBattleNotification("❌ Błąd!", "Google Maps nie jest dostępne");
      return;
    }

    const svService = new google.maps.StreetViewService();
    svService.getPanorama({ location: currentLocation, radius: 100 }, (data, status) => {
      if (status === "OK") {
        try {
          panorama = new google.maps.StreetViewPanorama(
            document.getElementById("street-view"),
            {
              pano: data.location.pano,
              addressControl: false,
              linksControl: true,
              panControl: true,
              enableCloseButton: false,
              fullscreenControl: false,
              clickToGo: true,
              scrollwheel: true,
              disableDoubleClickZoom: false,
              keyboardShortcuts: true
            }
          );
        } catch (error) {
          console.error('Błąd tworzenia Street View:', error);
          showBattleNotification("❌ Błąd!", "Nie można załadować Street View");
        }
      } else {
        console.error('Street View nie dostępne:', status);
        showBattleNotification("❌ Błąd!", "Street View niedostępne dla tej lokalizacji");
        // Spróbuj inną lokalizację
        setTimeout(() => startRound(), 1000);
      }
    });
  } catch (error) {
    console.error('Błąd w startRound:', error);
    showBattleNotification("❌ Błąd gry!", "Coś poszło nie tak. Spróbuj ponownie.");
  }

  // Ustaw czas z bonusem jeśli aktywny
  if (activeEffects.extraTime) {
    timeLeft = 180;
    activeEffects.extraTime = false; // Zużyj efekt po użyciu
  } else {
    timeLeft = 120;
  }

  // Pokaż podpowiedź kontynentu jeśli aktywna
  if (activeEffects.continentHint) {
    showContinentHint();
    activeEffects.continentHint = false; // Zużyj efekt
  }

  updateTimerDisplay();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      showGameOverScreen();
    }
  }, 1000);
}

function resetMarkers() {
  if (guessMarker) guessMarker.setMap(null);
  if (realMarker) realMarker.setMap(null);
  if (guessLine) guessLine.setMap(null);
  guessMarker = realMarker = guessLine = null;
}

function addSoundEffectsToButtons() {
  // Dodaj dźwięki do wszystkich przycisków
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      soundSystem.playClick();
    });
  });
  
  // Dodaj specjalne dźwięki dla konkretnych akcji
  const specialButtons = {
    'play-button': () => soundSystem.playSuccess(),
    'multiplayer-button': () => soundSystem.playNotification(),
    'shop-button': () => soundSystem.playCoin(),
    'shop-button-game': () => soundSystem.playCoin(),
    'guess-button': () => soundSystem.playNotification(),
    'next-button': () => soundSystem.playSuccess()
  };
  
  Object.keys(specialButtons).forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', specialButtons[id]);
    }
  });
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');
  const timerElement = document.getElementById("timer");

  timerElement.textContent = `${minutes}:${seconds}`;

  // Usuń wszystkie klasy
  timerElement.classList.remove('warning', 'critical');

  // Dodaj odpowiednie klasy w zależności od pozostałego czasu
  if (timeLeft <= 3) {
    timerElement.classList.add('critical');
    soundSystem.playTimer(); // Dodaj dźwięk timera
    // Wibracja telefonu jeśli dostępna
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  } else if (timeLeft <= 10) {
    timerElement.classList.add('warning');
    if (timeLeft === 10) {
      soundSystem.playTimer(); // Dźwięk ostrzeżenia na 10 sekund
    }
  }
}

function placeGuessMarker(latLng) {
  if (guessMarker) guessMarker.setMap(null);

  guessMarker = new google.maps.Marker({
    position: latLng,
    map: guessMap,
    label: "🎯",
  });

  document.getElementById("instruction").innerText = "Kliknij przycisk „Zgadnij!”, aby sprawdzić wynik.";
}

function makeGuess() {
  try {
    if (multiplayerState.isMultiplayer) {
      makeMultiplayerGuess();
      return;
    }

    if (mapLocked) return;
    mapLocked = true;
    clearInterval(timerInterval);

    if (!guessMarker) {
      const instruction = document.getElementById("instruction");
      if (instruction) {
        instruction.innerText = "Nie zaznaczyłeś lokalizacji!";
      }
      mapLocked = false;  // pozwól jeszcze raz kliknąć
      return;
    }

  const guessed = guessMarker.getPosition();
  const distance = haversineDistance(currentLocation, {
    lat: guessed.lat(),
    lng: guessed.lng(),
  });

  const points = calculatePoints(distance);

  realMarker = new google.maps.Marker({
    position: currentLocation,
    map: guessMap,
    label: "📍",
  });

  guessLine = new google.maps.Polyline({
    path: [guessed, currentLocation],
    geodesic: true,
    strokeColor: "#FF0000",
    strokeOpacity: 0,
    strokeWeight: 3,
    icons: [{
      icon: {
        path: "M 0,-2 0,2",
        strokeOpacity: 1,
        strokeColor: "#FF0000",
        strokeWeight: 3,
        scale: 2
      },
      offset: "0",
      repeat: "15px"
    }],
    map: guessMap
  });

  document.getElementById("instruction").style.display = "none";

  // Zablokuj kontrolki Street View
  if (panorama) {
    panorama.setOptions({
      panControl: false,
      zoomControl: false,
      addressControl: false,
      linksControl: false,
      enableCloseButton: false,
      clickToGo: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      keyboardShortcuts: false
    });
  }

  // Odblokuj mapę Google Maps
  if (guessMap) {
    guessMap.setOptions({
      draggable: true,
      zoomControl: true,
      scrollwheel: true,
      disableDoubleClickZoom: false,
      keyboardShortcuts: true
    });
  }

  // Dodaj punkty do sumy
  totalPoints += points;
  updateTotalPointsDisplay();
  
  // Zaktualizuj statystyki użytkownika
  if (currentUser) {
    updateUserStats(points, null);
  }

  // Animowana funkcja pokazywania wyniku
  showAnimatedResult(distance, points);

  document.getElementById("guess-button").style.display = "none";
  document.getElementById("next-button").style.display = "block";
}

function showAnimatedResult(distance, points) {
  const resultBox = document.getElementById("result-box");
  const resultOverlay = document.getElementById("result-overlay");
  const percentage = Math.min((points / 5000) * 100, 100);
  
  // Oblicz doświadczenie na podstawie punktów
  const expGained = Math.max(10, Math.floor(points / 50)); // Minimum 10 EXP, maksimum 100 EXP
  
  // Dodaj doświadczenie
  addExperience(expGained);

  // Przygotuj HTML z paskiem postępu i EXP
  resultBox.innerHTML = `
    <div class="result-line">📍 Odległość: ${distance.toFixed(2)} km</div>
    <div class="result-line points-container">
      <div class="points-bar-wrapper">
        <div class="points-bar" style="width: 0%;" data-target="${percentage}"></div>
      </div>
      <div class="points-text">🏆 ${points} / 5000 punktów</div>
    </div>
    <div class="result-line exp-container">
      <div class="exp-gained">⭐ +${expGained} EXP</div>
      <div class="level-info">Poziom ${playerLevel.level} (${playerLevel.exp}/${playerLevel.expToNext} EXP)</div>
    </div>
    <div class="result-line" id="location-name">🌍 Sprawdzam lokalizację...</div>
  `;

  // Pokaż overlay i box z animacją
  resultOverlay.style.display = "block";
  resultBox.style.display = "block";

  // Małe opóźnienie dla płynności
  setTimeout(() => {
    resultOverlay.classList.add('show');
    resultBox.classList.add('show');

    // Animuj pasek po pokazaniu boxa
    setTimeout(() => {
      const bar = resultBox.querySelector('.points-bar');
      bar.style.width = percentage + '%';
    }, 800);

    // Pobierz nazwę miasta
    getCityName(currentLocation);
  }, 50);
}

function calculatePoints(km) {
  // Prosty system: 5000 punktów minus 1 punkt za każdy kilometr
  var points = Math.round(5000 - km);
  points = Math.max(0, Math.min(points, 5000));

  // Podwójne punkty jeśli aktywne
  if (activeEffects.doublePoints) {
    points *= 2;
    activeEffects.doublePoints = false; // Zużyj efekt
    showEffectNotification("🎲 Podwójne punkty aktywne!", `${points/2} → ${points} punktów!`);
  }

  return points;
}

function nextRound() {
  if (multiplayerState.isMultiplayer) {
    nextMultiplayerRound();
  } else {
    startRound();
  }
}

function showGameOverScreen() {
  mapLocked = true;

  // Zablokuj Street View ale odblokuj mapę
  if (panorama) {
    panorama.setOptions({
      panControl: false,
      zoomControl: false,
      addressControl: false,
      linksControl: false,
      enableCloseButton: false,
      clickToGo: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      keyboardShortcuts: false
    });
  }

  if (guessMap) {
    guessMap.setOptions({
      draggable: true,
      zoomControl: true,
      scrollwheel: true,
      disableDoubleClickZoom: false,
      keyboardShortcuts: true
    });
  }

  // Ukryj instrukcje i przycisk zgadnij
  document.getElementById("instruction").style.display = "none";
  document.getElementById("guess-button").style.display = "none";

  // Pokaż marker prawdziwej lokalizacji jeśli był guess
  if (guessMarker) {
    const realMarker = new google.maps.Marker({
      position: currentLocation,
      map: guessMap,
      label: "📍",
    });

    const guessLine = new google.maps.Polyline({
      path: [guessMarker.getPosition(), currentLocation],
      geodesic: true,
      strokeColor: "#FF0000",
      strokeOpacity: 0,
      strokeWeight: 3,
      icons: [{
        icon: {
          path: "M 0,-2 0,2",
          strokeOpacity: 1,
          strokeColor: "#FF0000",
          strokeWeight: 3,
          scale: 2
        },
        offset: "0",
        repeat: "15px"
      }],
      map: guessMap
    });
  } else {
    // Jeśli nie było guess, pokaż tylko prawdziwą lokalizację
    const realMarker = new google.maps.Marker({
      position: currentLocation,
      map: guessMap,
      label: "📍",
    });
  }

  // Pokaż dramatyczne okienko końca gry
  const resultBox = document.getElementById("result-box");
  const resultOverlay = document.getElementById("result-overlay");
  resultBox.innerHTML = `
    <div class="result-line game-over-title">⏰ KONIEC CZASU! ⏰</div>
    <div class="result-line game-over-text">Niestety, czas się skończył!</div>
    <div class="result-line">🎯 Prawdziwa lokalizacja została oznaczona</div>
  `;

  resultOverlay.style.display = "block";
  resultBox.style.display = "block";

  // Wibracja telefonu jeśli dostępna - długa seria
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 400]);
  }

  setTimeout(() => {
    resultOverlay.classList.add('show');
    resultBox.classList.add('show');
    resultBox.classList.add('game-over');
  }, 50);

  // Pokaż przycisk dalej po chwili
  setTimeout(() => {
    document.getElementById("next-button").style.display = "block";
  }, 2000);
}

function haversineDistance(coord1, coord2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1.lat)) *
    Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Funkcje sklepu
function openShop() {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("shop").style.display = "flex";
  updateShopDisplay();
}

function closeShop() {
  document.getElementById("shop").style.display = "none";

  // Sprawdź z jakiego miejsca weszliśmy do sklepu
  if (multiplayerState.isMultiplayer && document.getElementById("mp-scoreboard").style.display === "flex") {
    // Wróć do multiplayer gry
    document.getElementById("game-container").style.display = "block";
    document.getElementById("mp-scoreboard").style.display = "flex";
    // Upewnij się że przycisk sklepu jest ukryty w multiplayer
    document.getElementById("shop-button-game").style.display = "none";
  } else if (document.getElementById("game-container").style.display === "block" || 
             (guessMap && currentLocation)) {
    // Wróć do gry solo
    document.getElementById("game-container").style.display = "block";
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("multiplayer").style.display = "none";
    // Pokaż przycisk sklepu w trybie solo
    document.getElementById("shop-button-game").style.display = "flex";
  } else if (document.getElementById("multiplayer").style.display === "flex") {
    // Wróć do menu multiplayer
    document.getElementById("multiplayer").style.display = "flex";
  } else {
    // Wróć do menu głównego
    document.getElementById("main-menu").style.display = "flex";
    // Zaktualizuj koronę w menu
    updateGoldenCrownDisplay();
  }
}

function openShopFromGame() {
  document.getElementById("game-container").style.display = "none";
  document.getElementById("shop").style.display = "flex";
  updateShopDisplay();
}

function updateShopDisplay() {
  // Użyj punktów z profilu użytkownika jeśli jest zalogowany
  const pointsToShow = currentUser ? currentUser.totalPoints : totalPoints;
  document.getElementById("shop-points").textContent = `💰 ${pointsToShow.toLocaleString()} punktów`;

  // Aktualizuj przyciski dla przedmiotów które już posiadamy
  updateShopButtons();
}

function updateShopButtons() {
  // Lista wszystkich przedmiotów kosmetycznych z ich itemId
  const cosmeticItems = [
    { itemId: 'goldenCrown', buttonText: 'Złota Korona' },
    { itemId: 'aimingReticle', buttonText: 'Celownik Pro' },
    { itemId: 'starPin', buttonText: 'Gwiezdny Pin' },
    { itemId: 'masterMedal', buttonText: 'Medal Mistrza' },
    { itemId: 'certificate', buttonText: 'Dyplom Geografa' },
    { itemId: 'bronzeMedal', buttonText: 'Brązowy Medal' }
  ];

  cosmeticItems.forEach(item => {
    if (inventory[item.itemId]) {
      // Znajdź przycisk dla tego przedmiotu
      const buttons = document.querySelectorAll('.buy-btn');
      buttons.forEach(button => {
        const onclick = button.getAttribute('onclick');
        if (onclick && onclick.includes(item.itemId)) {
          button.textContent = '✅';
          button.disabled = true;
          button.style.background = 'rgba(100, 100, 100, 0.5)';
          button.style.cursor = 'not-allowed';
        }
      });
    }
  });
}

async function buyItem(itemName, cost, description, itemType, itemId) {
  try {
    // Sprawdź czy przedmiot został już kupiony (tylko dla kosmetyków/kolekcji)
    if (itemType === 'cosmetic' && inventory[itemId]) {
      showAlreadyOwnedNotification(itemName);
      soundSystem.playError();
      return;
    }

    if (totalPoints >= cost) {
      totalPoints -= cost;
      soundSystem.playCoin(); // Dźwięk zakupu
    
    // Zaktualizuj punkty użytkownika na serwerze i w interfejsie
    if (currentUser) {
      currentUser.totalPoints = totalPoints;
      localStorage.setItem('monkiguessr-user', JSON.stringify(currentUser));
      
      // Zaktualizuj wyświetlanie punktów w menu głównym
      document.getElementById('user-total-points').textContent = currentUser.totalPoints.toLocaleString();
      
      // Wyślij aktualizację na serwer (opcjonalnie - nie blokuje interfejsu)
      try {
        await fetch('/api/update-stats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: currentUser.username,
            points: -cost, // Ujemne punkty oznaczają wydatek
            gameResult: null
          })
        });
      } catch (error) {
        console.error('Error updating points on server:', error);
      }
    }
    
    saveTotalPoints();
    updateShopDisplay();
    updateTotalPointsDisplay();

    // Aktywuj efekt w zależności od typu przedmiotu
    if (itemType === 'booster') {
      activateBooster(itemId);
    } else if (itemType === 'cosmetic') {
      inventory[itemId] = true;
      saveInventory();
      updateShopDisplay(); // Odśwież sklep żeby zaktualizować przyciski

      // Pokaż złotą koronę jeśli została kupiona
      if (itemId === 'goldenCrown') {
        updateGoldenCrownDisplay();
      }

      // Aktywuj zajebisty celownik jeśli został kupiony
      if (itemId === 'aimingReticle') {
        const mapDiv = document.getElementById("guess-map");
        if (mapDiv && guessMap) {
          setupCustomCrosshair(mapDiv);
          showEffectNotification("🎯 Zajebisty celownik aktywny!", "Twój celownik jest teraz ultra precyzyjny!");
        }
      }
    }

    // Pokaż powiadomienie o zakupie
    showPurchaseNotification(itemName, description);
  } else {
    showInsufficientFundsNotification(cost - totalPoints);
  }
  } catch (error) {
    console.error('Error buying item:', error);
    showBattleNotification("❌ Błąd zakupu!", "Coś poszło nie tak podczas zakupu przedmiotu");
  }
}

function updateGoldenCrownDisplay() {
  const crownElement = document.getElementById('golden-crown');
  if (crownElement) {
    if (inventory.goldenCrown) {
      crownElement.classList.add('show');
    } else {
      crownElement.classList.remove('show');
    }
  }
}

// Funkcja do ustawienia custom celownika
function setupCustomCrosshair(mapElement) {
  mapElement.classList.add('custom-crosshair');

  // Usuń poprzedni celownik jeśli istnieje
  const existingCrosshair = document.querySelector('.custom-crosshair-cursor');
  if (existingCrosshair) {
    existingCrosshair.remove();
  }

  // Stwórz custom celownik
  const crosshair = document.createElement('div');
  crosshair.className = 'custom-crosshair-cursor';
  crosshair.innerHTML = `
    <div class="crosshair-element">
      <div class="crosshair-ring"></div>
      <div class="crosshair-lines">
        <div class="crosshair-line horizontal"></div>
        <div class="crosshair-line vertical"></div>
        <div class="crosshair-line h-left"></div>
        <div class="crosshair-line h-right"></div>
        <div class="crosshair-line v-top"></div>
        <div class="crosshair-line v-bottom"></div>
      </div>
      <div class="crosshair-center"></div>
    </div>
  `;

  document.body.appendChild(crosshair);

  // Event listenery dla ruchu myszy
  let isOverMap = false;

  mapElement.addEventListener('mouseenter', () => {
    isOverMap = true;
    crosshair.style.display = 'block';
  });

  mapElement.addEventListener('mouseleave', () => {
    isOverMap = false;
    crosshair.style.display = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (isOverMap) {
      crosshair.style.left = e.clientX + 'px';
      crosshair.style.top = e.clientY + 'px';
    }
  });

  // Ukryj celownik gdy mapa jest zablokowana - uproszczona wersja
  const originalMapLocked = mapLocked;
}

function removeCustomCrosshair() {
  const mapDiv = document.getElementById("guess-map");
  if (mapDiv) {
    mapDiv.classList.remove('custom-crosshair');
    mapDiv.style.cursor = "crosshair";
  }

  const existingCrosshair = document.querySelector('.custom-crosshair-cursor');
  if (existingCrosshair) {
    existingCrosshair.remove();
  }
}

function activateBooster(boosterId) {
  switch(boosterId) {
    case 'extraTime':
      activeEffects.extraTime = true;
      showEffectNotification("⏱️ Dodatkowy czas aktywny!", "Następna runda będzie trwać 3 minuty!");
      break;
    case 'doublePoints':
      activeEffects.doublePoints = true;
      showEffectNotification("🎲 Podwójne punkty aktywne!", "Następna runda da 2x punktów!");
      break;
    case 'continentHint':
      activeEffects.continentHint = true;
      showEffectNotification("🗺️ Podpowiedź aktywna!", "Na początku następnej rundy zobaczysz kontynent!");
      break;
  }
}

function showContinentHint() {
  const continent = getContinent(currentLocation);
  const hintElement = document.createElement('div');
  hintElement.id = 'continent-hint';
  hintElement.style.cssText = `
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    background: rgba(255, 215, 0, 0.9);
    color: black;
    padding: 15px 25px;
    border-radius: 15px;
    font-family: 'Titan One', cursive;
    font-size: 20px;
    text-shadow: none;
    border: 3px solid #ffd700;
    animation: hint-bounce 0.5s ease-out;
  `;
  hintElement.innerHTML = `🗺️ Kontynent: ${continent}`;

  document.body.appendChild(hintElement);

  // Usuń podpowiedź po 5 sekundach
setTimeout(() => {
    if (hintElement.parentNode) {
      hintElement.remove();
    }
  }, 5000);
}

function getContinent(location) {
  const lat = location.lat;
  const lng = location.lng;

  // Europa
  if (lat >= 35 && lat <= 71 && lng >= -25 && lng <= 45) {
    return "Europa";
  }
  // Azja
  if (lat >= 5 && lat <= 81 && lng >= 25 && lng <= 180) {
    return "Azja";
  }
  // Afryka
  if (lat >= -35 && lat <= 37 && lng >= -20 && lng <= 55) {
    return "Afryka";
  }
  // Ameryka Północna
  if (lat >= 15 && lat <= 72 && lng >= -168 && lng <= -52) {
    return "Ameryka Północna";
  }
  // Ameryka Południowa
  if (lat >= -56 && lat <= 13 && lng >= -82 && lng <= -35) {
    return "Ameryka Południowa";
  }
  // Australia/Oceania
  if (lat >= -50 && lat <= -10 && lng >= 110 && lng <= 180) {
    return "Australia/Oceania";
  }
  // Antarktyda
  if (lat <= -60) {
    return "Antarktyda";
  }

  return "Nieznany kontynent";
}

function showEffectNotification(title, description) {
  const notificationData = {
    type: 'success',
    html: `
      <div class="notification-icon">⚡</div>
      <div class="notification-text">
        <div class="notification-title">${title}</div>
        <div class="notification-desc">${description}</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

function saveInventory() {
  localStorage.setItem('monkiguessr-inventory', JSON.stringify(inventory));
}

function loadInventory() {
  const saved = localStorage.getItem('monkiguessr-inventory');
  return saved ? JSON.parse(saved) : inventory;
}

// System kolejkowania powiadomień
var notificationQueue = [];
var isShowingNotification = false;

function queueNotification(notificationData) {
  try {
    if (!notificationData || !notificationData.html) {
      console.error('Invalid notification data:', notificationData);
      return;
    }
    
    notificationQueue.push(notificationData);
    if (!isShowingNotification) {
      showNextNotification();
    }
  } catch (error) {
    console.error('Error queueing notification:', error);
  }
}

function showNextNotification() {
  try {
    if (notificationQueue.length === 0) {
      isShowingNotification = false;
      return;
    }

    isShowingNotification = true;
    const notificationData = notificationQueue.shift();

    if (!notificationData || !notificationData.html) {
      console.error('Invalid notification data in queue:', notificationData);
      showNextNotification();
      return;
    }

    // Odtwórz odpowiedni dźwięk w zależności od typu powiadomienia
    if (notificationData.type === 'success' || notificationData.type === 'levelup') {
      soundSystem.playSuccess();
    } else if (notificationData.type === 'error') {
      soundSystem.playError();
    } else {
      soundSystem.playNotification();
    }

    const notification = document.createElement('div');
    notification.className = `purchase-notification ${notificationData.type || 'success'}`;
    notification.innerHTML = notificationData.html;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('show');
      }
    }, 100);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.remove('show');
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
          // Pokaż następne powiadomienie po ukryciu obecnego
          showNextNotification();
        }, 500);
      }
    }, 3000);
  } catch (error) {
    console.error('Error showing notification:', error);
    isShowingNotification = false;
    // Spróbuj pokazać następne powiadomienie
    if (notificationQueue.length > 0) {
      setTimeout(() => showNextNotification(), 1000);
    }
  }
}

function showPurchaseNotification(itemName, description) {
  try {
    const notificationData = {
      type: 'success',
      html: `
        <div class="notification-icon">🎉</div>
        <div class="notification-text">
          <div class="notification-title">Zakupiono!</div>
          <div class="notification-desc">${itemName || 'Przedmiot'}</div>
          <div class="notification-detail">${description || 'Pomyślnie kupiono przedmiot!'}</div>
        </div>
      `
    };

    queueNotification(notificationData);
  } catch (error) {
    console.error('Error showing purchase notification:', error);
  }
}

function showInsufficientFundsNotification(needed) {
  const notificationData = {
    type: 'error',
    html: `
      <div class="notification-icon">💸</div>
      <div class="notification-text">
        <div class="notification-title">Brak środków!</div>
        <div class="notification-desc">Potrzebujesz jeszcze ${needed.toLocaleString()} punktów</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

function showAlreadyOwnedNotification(itemName) {
  const notificationData = {
    type: 'error',
    html: `
      <div class="notification-icon">✅</div>
      <div class="notification-text">
        <div class="notification-title">Już posiadasz!</div>
        <div class="notification-desc">${itemName} jest już w twojej kolekcji</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

// Funkcje Multiplayer
function openMultiplayer() {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("multiplayer").style.display = "flex";
  updateMultiplayerStats();
}

function closeMultiplayer() {
  document.getElementById("multiplayer").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
  leaveRoom();
}

function updateMultiplayerStats() {
  document.getElementById("mp-points").textContent = multiplayerStats.points.toLocaleString();
  document.getElementById("mp-wins").textContent = multiplayerStats.wins;
  document.getElementById("mp-losses").textContent = multiplayerStats.losses;
}

function createRoom() {
  if (!currentUser) {
    showBattleNotification("❌ Błąd!", "Musisz być zalogowany aby grać w multiplayer!");
    return;
  }

  if (!multiplayerState.isRealMultiplayer) {
    if (connectToWebSocket() === false) {
      return;
    }
  }
  const roomCode = generateRoomCode();
  multiplayerState.roomCode = roomCode;
  multiplayerState.isHost = true;
  multiplayerState.isMultiplayer = true;
  multiplayerState.isRealMultiplayer = true;
  multiplayerState.myNickname = currentUser.username;

  // Poczekaj na połączenie i dołącz do pokoju
  setTimeout(() => {
    if (multiplayerState.socket && multiplayerState.socket.connected) {
      multiplayerState.socket.emit('joinRoom', {
        roomCode: roomCode,
        playerName: currentUser.username,
        isHost: true
      });
    }
  }, 500);

  document.querySelector('.multiplayer-modes').style.display = 'none';
  document.getElementById('waiting-room').style.display = 'block';
  document.getElementById('current-room-code').textContent = roomCode;

  // Pokaż nick hosta w waiting room
  document.querySelector('#waiting-room .player-slot.filled .player-name').textContent = `${currentUser.username} (Host)`;

  showBattleNotification("🏠 Pokój utworzony!", `Kod: ${roomCode} - Czekam na prawdziwego gracza!`);
}

function quickMatch() {
  showBattleNotification("⚡ Szukam przeciwnika...", "Znajdowanie godnego rywala...");

  multiplayerState.isHost = false;
  multiplayerState.isMultiplayer = true;
  multiplayerState.roomCode = generateRoomCode();

  // Symuluj znalezienie przeciwnika po 2-5 sekundach
  setTimeout(() => {
    multiplayerState.opponentName = getRandomOpponentName();
    showBattleNotification("⚔️ Przeciwnik znaleziony!", `Walczysz z: ${multiplayerState.opponentName}`);

    setTimeout(() => {
      startMultiplayerGame();
    }, 2000);
  }, Math.random() * 3000 + 2000);
}

function joinRoom() {
  const roomCode = document.getElementById('room-code').value.trim().toUpperCase();

  if (!roomCode || roomCode.length !== 6) {
    showBattleNotification("❌ Błąd!", "Wpisz prawidłowy kod pokoju (6 znaków)");
    return;
  }

  if (!currentUser) {
    showBattleNotification("❌ Błąd!", "Musisz być zalogowany aby grać w multiplayer!");
    return;
  }

  if (!multiplayerState.isRealMultiplayer) {
    if (connectToWebSocket() === false) {
      return;
    }
  }

  multiplayerState.roomCode = roomCode;
  multiplayerState.isHost = false;
  multiplayerState.isMultiplayer = true;
  multiplayerState.isRealMultiplayer = true;
  multiplayerState.myNickname = currentUser.username;

  showBattleNotification("🔑 Dołączanie...", `Kod: ${roomCode}`);

  // Poczekaj na połączenie i dołącz do pokoju
  setTimeout(() => {
    if (multiplayerState.socket && multiplayerState.socket.connected) {
      multiplayerState.socket.emit('joinRoom', {
        roomCode: roomCode,
        playerName: currentUser.username,
        isHost: false
      });
    }
  }, 500);
}

function opponentJoined() {
  multiplayerState.opponentName = getRandomOpponentName();
  document.getElementById('opponent-slot').classList.add('filled');
  document.getElementById('opponent-slot').innerHTML = `
    <div class="player-avatar">⚔️</div>
    <div class="player-name">${multiplayerState.opponentName}</div>
  `;
  document.getElementById('start-game-btn').disabled = false;

  showBattleNotification("⚔️ Przeciwnik dołączył!", `${multiplayerState.opponentName} jest gotowy do walki!`);
}

function startMultiplayerGame() {
  // Sprawdź czy gracz jest hostem
  if (multiplayerState.isRealMultiplayer && !multiplayerState.isHost) {
    showBattleNotification("❌ Tylko host może startować!", "Poczekaj aż host rozpocznie grę");
    return;
  }

  if (multiplayerState.isRealMultiplayer && multiplayerState.socket) {
    // Prawdziwy multiplayer
    multiplayerState.socket.emit('startGame', {
      roomCode: multiplayerState.roomCode
    });
    showBattleNotification("🎮 ROZPOCZYNAM PRAWDZIWĄ WALKĘ!", "Oba urządzenia otrzymają tę samą lokalizację!");
  } else {
    // Stary bot system
    multiplayerState.myScore = 0;
    multiplayerState.opponentScore = 0;
    multiplayerState.currentRound = 1;
    multiplayerState.gameEnded = false;

    document.getElementById("multiplayer").style.display = "none";
    document.getElementById("game-container").style.display = "block";
    document.getElementById("mp-scoreboard").style.display = "flex";

    // Ukryj przycisk sklepu w multiplayer
    document.getElementById("shop-button-game").style.display = "none";

    initMultiplayerMaps();
    showBattleNotification("🎮 WALKA ROZPOCZĘTA!", `Runda ${multiplayerState.currentRound}/${multiplayerState.maxRounds}`);
    startMultiplayerRound();
  }
}

function initMultiplayerMaps() {
  guessMap = new google.maps.Map(document.getElementById("guess-map"), {
    center: { lat: 0, lng: 0 },
    zoom: 2,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
  });

  // Ustaw odpowiedni kursor na mapie
  const mapDiv = document.getElementById("guess-map");
  if (inventory.aimingReticle) {
    setupCustomCrosshair(mapDiv);
  } else {
    mapDiv.style.cursor = "crosshair";
  }

  // Pokaż błyszczącą naklejkę star pin jeśli jest w inwentarzu
  updateStarPinSticker();

  guessMap.addListener("click", (e) => {
    if (mapLocked) return;
    placeMultiplayerGuessMarker(e.latLng);
  });

  // Dodaj toggle button
  const toggleButton = document.createElement('div');
  toggleButton.innerHTML = '⛶';
  toggleButton.style.cssText = `
    background: rgba(255, 255, 255, 0.95);
    border: 2px solid #333;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    margin: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    user-select: none;
  `;

  toggleButton.addEventListener('click', () => {
    const guessMapDiv = document.getElementById('guess-map');
    if (guessMapDiv.classList.contains('expanded')) {
      guessMapDiv.classList.remove('expanded');
    } else {
      guessMapDiv.classList.add('expanded');
    }
    google.maps.event.trigger(guessMap, 'resize');
  });

  guessMap.controls[google.maps.ControlPosition.TOP_LEFT].push(toggleButton);
}

function startMultiplayerRound() {
  mapLocked = false;
  const resultBox = document.getElementById("result-box");
  const resultOverlay = document.getElementById("result-overlay");
  resultBox.classList.remove('show', 'game-over');
  resultBox.style.display = "none";
  resultOverlay.classList.remove('show');
  resultOverlay.style.display = "none";
  document.getElementById("next-button").style.display = "none";
  document.getElementById("guess-button").style.display = "block";
  document.getElementById("instruction").style.display = "block";
  document.getElementById("instruction").innerText = `⚔️ RUNDA ${multiplayerState.currentRound} - Kliknij na mapie aby zgadnąć!`;
  resetMarkers();
  cleanupTempMarkers();

  // Zaktualizuj scoreboard
  updateScoreboard();

  currentLocation = randomLocations[Math.floor(Math.random() * randomLocations.length)];

  const svService = new google.maps.StreetViewService();
  svService.getPanorama({ location: currentLocation, radius: 100 }, (data, status) => {
    if (status === "OK") {
      panorama = new google.maps.StreetViewPanorama(
        document.getElementById("street-view"),
        {
          pano: data.location.pano,
          addressControl: false,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
          fullscreenControl: false,
          clickToGo: true,
          scrollwheel: true,
          disableDoubleClickZoom: false,
          keyboardShortcuts: true
        }
      );
    }
  });

  timeLeft = 90; // Krótszy czas w multiplayerze
  updateTimerDisplay();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      makeMultiplayerGuess(true); // Auto-submit gdy czas się skończy
    }
  }, 1000);
}

function placeMultiplayerGuessMarker(latLng) {
  if (guessMarker) guessMarker.setMap(null);

  guessMarker = new google.maps.Marker({
    position: latLng,
    map: guessMap,
    label: "🎯",
  });

  multiplayerState.myGuess = latLng;
  document.getElementById("instruction").innerText = `⚔️ Kliknij "Zgadnij!" aby potwierdzić swoją lokalizację!`;
}

function makeMultiplayerGuess(timeUp = false) {
  if (multiplayerState.isRealMultiplayer) {
    makeRealMultiplayerGuess(timeUp);
    return;
  }

  if (mapLocked) return;
  mapLocked = true;
  clearInterval(timerInterval);

  if (!multiplayerState.myGuess && !timeUp) {
    document.getElementById("instruction").innerText = "Nie zaznaczyłeś lokalizacji!";
    mapLocked = false;
    return;
  }

  updateScoreboard("waiting");

  if (timeUp) {
    showBattleNotification("⏰ Czas minął!", "Automatyczne wysłanie odpowiedzi");
  } else {
    showBattleNotification("✅ Zgadywanie wysłane!", "Czekamy na przeciwnika...");
  }

  document.getElementById("instruction").innerText = "⏳ Czekamy na przeciwnika...";
  document.getElementById("guess-button").style.display = "none";

  simulateOpponentGuess();

  setTimeout(() => {
    calculateAndShowResults();
  }, Math.random() * 2000 + 2000);
}

function calculateAndShowResults() {
  // Oblicz wyniki
  const myDistance = multiplayerState.myGuess ? 
    haversineDistance(currentLocation, {
      lat: multiplayerState.myGuess.lat(),
      lng: multiplayerState.myGuess.lng(),
    }) : 20000; // Kara za brak guess

  const opponentDistance = multiplayerState.opponentGuess ? 
    haversineDistance(currentLocation, multiplayerState.opponentGuess) : 
    Math.random() * 15000 + 1000; // Losowa odległość przeciwnika

  const myPoints = calculatePoints(myDistance);
  const opponentPoints = calculatePoints(opponentDistance);

  multiplayerState.myScore += myPoints;
  multiplayerState.opponentScore += opponentPoints;

  // Dodaj punkty z rundy do totalnych punktów (bez bonusów)
  totalPoints += myPoints;
  updateTotalPointsDisplay();

  // Jeśli to prawdziwy użytkownik, zaktualizuj jego statystyki podstawowe
  if (currentUser && myPoints > 0) {
    updateUserStats(myPoints, null); // Aktualizuj podstawowe statystyki za punkty z rundy
  }

  // Pokaż markery
  showMultiplayerResults(myDistance, opponentDistance, myPoints, opponentPoints);
}

function simulateOpponentGuess() {
  // Pokaż powiadomienie o zgadywaniu przeciwnika
  showBattleNotification("🤖 Przeciwnik myśli...", `${multiplayerState.opponentName} analizuje lokalizację`);

  // Symuluj czas myślenia (1-3 sekundy)
  const thinkingTime = Math.random() * 2000 + 1000;

  setTimeout(() => {
    // Określ poziom umiejętności przeciwnika
    const skill = Math.random();
    let opponentDistance;
    let skillLevel = "";

    if (skill > 0.9) {
      // Ekspert - bardzo blisko
      opponentDistance = Math.random() * 500 + 50;
      skillLevel = "💎 EKSPERT";
    } else if (skill > 0.7) {
      // Bardzo dobry przeciwnik
      opponentDistance = Math.random() * 2000 + 200;
      skillLevel = "🔥 PRO";
    } else if (skill > 0.4) {
      // Średni przeciwnik  
      opponentDistance = Math.random() * 6000 + 1000;
      skillLevel = "⚡ ŚREDNI";
    } else {
      // Słaby przeciwnik
      opponentDistance = Math.random() * 12000 + 3000;
      skillLevel = "🤔 POCZĄTKUJĄCY";
    }

    // Wygeneruj pozycję w odpowiedniej odległości
    const angle = Math.random() * 2 * Math.PI;
    const earthRadius = 6371000; // metry
    const angularDistance = opponentDistance / earthRadius;

    const lat1 = currentLocation.lat * Math.PI / 180;
    const lng1 = currentLocation.lng * Math.PI / 180;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + 
                          Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(angle));
    const lng2 = lng1 + Math.atan2(Math.sin(angle) * Math.sin(angularDistance) * Math.cos(lat1),
                                  Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));

    multiplayerState.opponentGuess = {
      lat: lat2 * 180 / Math.PI,
      lng: lng2 * 180 / Math.PI
    };

    // Pokaż marker przeciwnika na mapie z animacją
    showOpponentGuessMarker();

    // Powiadomienie o zgadnięciu
    showBattleNotification(`🎯 ${multiplayerState.opponentName} zgadł!`, `${skillLevel} - ${opponentDistance.toFixed(0)}km od celu`);

    // Zaktualizuj status na scoreboardzie
    updateScoreboard();
  }, thinkingTime);
}

function showOpponentGuessMarker() {
  // Utwórz marker przeciwnika z animacją
  const opponentMarker = new google.maps.Marker({
    position: multiplayerState.opponentGuess,
    map: guessMap,
    label: "🤖",
    animation: google.maps.Animation.DROP
  });

  // Dodaj pulsujący efekt do markera przeciwnika - uproszczona wersja
  setTimeout(() => {
    const markerElement = opponentMarker.getDiv();
    if (markerElement) {
      markerElement.style.animation = "opponent-pulse 1s ease-in-out infinite alternate";
    }
  }, 100);

  // Pokaż okienko info z nazwą przeciwnika
  const infoWindow = new google.maps.InfoWindow({
    content: `<div style="text-align: center; font-family: 'Titan One', cursive; color: #333;">
                <strong>${multiplayerState.opponentName}</strong><br>
                <small>🤖 Zgadywanie bota</small>
              </div>`
  });

  // Pokaż info window na 2 sekundy
  infoWindow.open(guessMap, opponentMarker);
  setTimeout(() => {
    infoWindow.close();
  }, 2000);

  // Dodaj marker do listy do późniejszego usunięcia
  if (!multiplayerState.tempMarkers) {
    multiplayerState.tempMarkers = [];
  }
  multiplayerState.tempMarkers.push(opponentMarker);
}

function showMultiplayerResults(myDistance, opponentDistance, myPoints, opponentPoints) {
  // Pokaż markery na mapie
  if (multiplayerState.myGuess) {
    if (guessMarker) guessMarker.setMap(null);
    guessMarker = new google.maps.Marker({
      position: multiplayerState.myGuess,
      map: guessMap,
      label: "🎯",
    });
  }

  // Marker przeciwnika
  const opponentMarker = new google.maps.Marker({
    position: multiplayerState.opponentGuess,
    map: guessMap,
    label: "⚔️",
  });

  // Prawdziwa lokalizacja
  realMarker = new google.maps.Marker({
    position: currentLocation,
    map: guessMap,
    label: "📍",
  });

  // Linie
  if (multiplayerState.myGuess) {
    const myLine = new google.maps.Polyline({
      path: [multiplayerState.myGuess, currentLocation],
      geodesic: true,
      strokeColor: "#00FF00",
      strokeOpacity: 0,
      strokeWeight: 3,
      icons: [{
        icon: {
          path: "M 0,-2 0,2",
          strokeOpacity: 1,
          strokeColor: "#00FF00",
          strokeWeight: 3,
          scale: 2
        },
        offset: "0",
        repeat: "15px"
      }],
      map: guessMap
    });
  }

  const opponentLine = new google.maps.Polyline({
    path: [multiplayerState.opponentGuess, currentLocation],
    geodesic: true,
    strokeColor: "#FF0000",
    strokeOpacity: 0,
    strokeWeight: 3,
    icons: [{
      icon: {
        path: "M 0,-2 0,2",
        strokeOpacity: 1,
        strokeColor: "#FF0000",
        strokeWeight: 3,
        scale: 2
      },
      offset: "0",
      repeat: "15px"
    }],
    map: guessMap
  });

  updateScoreboard();

  // Pokaż wyniki rundy
  showMultiplayerRoundResult(myDistance, opponentDistance, myPoints, opponentPoints);
}

function showMultiplayerRoundResult(myDistance, opponentDistance, myPoints, opponentPoints) {
  const resultBox = document.getElementById("result-box");
  const resultOverlay = document.getElementById("result-overlay");

  let winner = "";
  let winnerIcon = "";

  if (myPoints > opponentPoints) {
    winner = "🏆 WYGRAŁEŚ RUNDĘ!";
    winnerIcon = "🎉";
  } else if (opponentPoints > myPoints) {
    winner = "💀 PRZEGRAŁEŚ RUNDĘ!";
    winnerIcon = "😭";
  } else {
    winner = "🤝 REMIS!";
    winnerIcon = "🤔";
  }

  resultBox.innerHTML = `
    <div class="result-line game-over-title">${winner}</div>
    <div class="result-line">
      <div style="display: flex; justify-content: space-between; margin: 20px 0;">
        <div style="text-align: center;">
          <div style="color: #00FF00; font-size: 1.2em;">🎯 TY</div>
          <div>${myDistance.toFixed(2)} km</div>
          <div>🏆 ${myPoints} pkt</div>
        </div>
        <div style="text-align: center;">
          <div style="color: #FF0000; font-size: 1.2em;">⚔️ ${multiplayerState.opponentName}</div>
          <div>${opponentDistance.toFixed(2)} km</div>
          <div>🏆 ${opponentPoints} pkt</div>
        </div>
      </div>
    </div>
    <div class="result-line">Runda ${multiplayerState.currentRound}/${multiplayerState.maxRounds}</div>
    <div class="result-line" id="location-name">🌍 Sprawdzam lokalizację...</div>
  `;

  resultOverlay.style.display = "block";
  resultBox.style.display = "block";

  setTimeout(() => {
    resultOverlay.classList.add('show');
    resultBox.classList.add('show');

    // Pobierz nazwę miasta
    getCityName(currentLocation);
  }, 50);

  document.getElementById("guess-button").style.display = "none";

  // Sprawdź czy gra się skończyła
  if (multiplayerState.currentRound >= multiplayerState.maxRounds) {
    setTimeout(() => {
      endMultiplayerGame();
    }, 3000);
  } else {
    setTimeout(() => {
      document.getElementById("next-button").style.display = "block";
    }, 2000);
  }
}

function nextMultiplayerRound() {
  multiplayerState.currentRound++;
  multiplayerState.myGuess = null;
  multiplayerState.opponentGuess = null;
  startMultiplayerRound();
}

function endMultiplayerGame() {
  multiplayerState.gameEnded = true;

  let gameResult = "";
  let resultClass = "";
  let pointsEarned = 0;
  let mpResult = null;

  if (multiplayerState.myScore > multiplayerState.opponentScore) {
    gameResult = "🏆 ZWYCIĘSTWO!";
    resultClass = "victory";
    multiplayerStats.wins++;
    multiplayerStats.points += 1000;
    pointsEarned = multiplayerState.myScore + 2000; // Punkty z gry + bonus za wygraną
    mpResult = 'win';
    soundSystem.playVictory(); // Dźwięk zwycięstwa
  } else if (multiplayerState.opponentScore > multiplayerState.myScore) {
    gameResult = "💀 PORAŻKA!";
    resultClass = "defeat";
    multiplayerStats.losses++;
    pointsEarned = multiplayerState.myScore + 500; // Punkty z gry + pocieszenie
    mpResult = 'loss';
    soundSystem.playDefeat(); // Dźwięk porażki
  } else {
    gameResult = "🤝 REMIS!";
    resultClass = "draw";
    multiplayerStats.points += 500;
    pointsEarned = multiplayerState.myScore + 1000; // Punkty z gry + bonus za remis
    mpResult = 'draw';
    soundSystem.playNotification(); // Dźwięk remisu
  }

  // Dodaj punkty do totalPoints
  totalPoints += pointsEarned;
  
  // Zaktualizuj statystyki na serwerze
  if (currentUser) {
    updateUserMultiplayerStats(pointsEarned, mpResult);
  }

  // Zapisz statystyki lokalnie i zaktualizuj wyświetlanie
  saveMultiplayerStats();
  updateTotalPointsDisplay();

  const resultBox = document.getElementById("result-box");
  resultBox.innerHTML = `
    <div class="result-line game-over-title ${resultClass}">${gameResult}</div>
    <div class="result-line">
      <div style="display: flex; justify-content: space-between; margin: 30px 0;">
        <div style="text-align: center;">
          <div style="color: #00FF00; font-size: 1.5em;">🎯 TY</div>
          <div style="font-size: 2em; margin: 10px 0;">${multiplayerState.myScore}</div>
          <div>PUNKTÓW</div>
        </div>
        <div style="text-align: center; font-size: 3em; color: #ffd700;">VS</div>
        <div style="text-align: center;">
          <div style="color: #FF0000; font-size: 1.5em;">⚔️ ${multiplayerState.opponentName}</div>
          <div style="font-size: 2em; margin: 10px 0;">${multiplayerState.opponentScore}</div>
          <div>PUNKTÓW</div>
        </div>
      </div>
    </div>
    <div style="margin-top: 20px;">
      <button onclick="backToMultiplayerMenu()" style="
        background: linear-gradient(45deg, #3498db, #2980b9);
        color: white;
        border: none;
        border-radius: 25px;
        padding: 15px 30px;
        font-family: 'Titan One', cursive;
        font-size: 1.2em;
        cursor: pointer;
        margin: 10px;
      ">🔄 Nowa walka</button>
      <button onclick="showMainMenu()" style="
        background: linear-gradient(45deg, #95a5a6, #7f8c8d);
        color: white;
        border: none;
        border-radius: 25px;
        padding: 15px 30px;
        font-family: 'Titan One', cursive;
        font-size: 1.2em;
        cursor: pointer;
        margin: 10px;
      ">🏠 Menu główne</button>
    </div>
  `;
}

function backToMultiplayerMenu() {
  // Reset multiplayer state
  multiplayerState.isMultiplayer = false;
  multiplayerState.isHost = false;
  multiplayerState.roomCode = null;

  // Ukryj grę i pokaż multiplayer
  document.getElementById("game-container").style.display = "none";
  document.getElementById("mp-scoreboard").style.display = "none";
  document.getElementById("multiplayer").style.display = "flex";

  // Reset interfejsu multiplayera
  document.querySelector('.multiplayer-modes').style.display = 'grid';
  document.getElementById('waiting-room').style.display = 'none';
  document.getElementById('room-code').value = '';

  updateMultiplayerStats();
}

function leaveRoom() {
  // Zatrzymaj timer jeśli jest aktywny
  clearInterval(timerInterval);

  // Jeśli to prawdziwy multiplayer, wyślij informację do serwera
  if (multiplayerState.socket && multiplayerState.roomCode) {
    multiplayerState.socket.emit('leaveRoom', {
      roomCode: multiplayerState.roomCode
    });
    multiplayerState.socket.disconnect();
  }

  // Reset stanu multiplayer
  multiplayerState.isMultiplayer = false;
  multiplayerState.isHost = false;
  multiplayerState.roomCode = null;
  multiplayerState.isRealMultiplayer = false;
  multiplayerState.socket = null;
  multiplayerState.myScore = 0;
  multiplayerState.opponentScore = 0;
  multiplayerState.currentRound = 1;
  multiplayerState.gameEnded = false;

  // Ukryj wszystkie ekrany gry
  document.getElementById("game-container").style.display = "none";
  document.getElementById("mp-scoreboard").style.display = "none";
  document.getElementById("waiting-room").style.display = "none";

  // Pokaż menu multiplayer
  document.getElementById("multiplayer").style.display = "flex";
  document.querySelector('.multiplayer-modes').style.display = 'grid';

  // Wyczyść pole kodu pokoju
  document.getElementById('room-code').value = '';

  // Reset waiting room
  document.getElementById('opponent-slot').classList.remove('filled');
  document.getElementById('opponent-slot').innerHTML = `
    <div class="player-avatar">👤</div>
    <div class="player-name">Czekam na gracza...</div>
  `;
  document.getElementById('start-game-btn').disabled = true;

  showBattleNotification("🚪 Opuściłeś pokój", "Powrót do menu multiplayer");
}

function updateScoreboard(status = null) {
  const myScoreEl = document.querySelector('#mp-scoreboard .scoreboard-player:first-child .player-score');
  const opponentScoreEl = document.querySelector('#mp-scoreboard .scoreboard-player:last-child .player-score');
  const myStatusEl = document.querySelector('#mp-scoreboard .scoreboard-player:first-child .player-status');
  const opponentStatusEl = document.querySelector('#mp-scoreboard .scoreboard-player:last-child .player-status');
  const myNameEl = document.querySelector('#mp-scoreboard .scoreboard-player:first-child .player-name');
  const opponentNameEl = document.querySelector('#mp-scoreboard .scoreboard-player:last-child .player-name');

  if (myScoreEl) myScoreEl.textContent = `${multiplayerState.myScore} pkt`;
  if (opponentScoreEl) opponentScoreEl.textContent = `${multiplayerState.opponentScore} pkt`;
  if (myNameEl) myNameEl.textContent = multiplayerState.myNickname || 'Ty';
  if (opponentNameEl) opponentNameEl.textContent = multiplayerState.opponentName;

  // Aktualizuj statusy na podstawie parametru
  if (status === "waiting") {
    if (myStatusEl) myStatusEl.textContent = "✅";
    if (opponentStatusEl) opponentStatusEl.textContent = "⏳";
  } else if (status === "opponent-guessed") {
    if (myStatusEl) myStatusEl.textContent = "⏳";
    if (opponentStatusEl) opponentStatusEl.textContent = "✅";
  } else if (mapLocked) {
    if (myStatusEl) myStatusEl.textContent = "✅";
    if (opponentStatusEl) opponentStatusEl.textContent = "✅";
  } else {
    if (myStatusEl) myStatusEl.textContent = "🤔";
    if (opponentStatusEl) opponentStatusEl.textContent = "🤔";
  }
}

function cleanupTempMarkers() {
  if (multiplayerState.tempMarkers) {
    multiplayerState.tempMarkers.forEach(marker => {
      if (marker.setMap) marker.setMap(null);
    });
    multiplayerState.tempMarkers = [];
  }
}

function generateRoomCode() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var result = '';
  for (var i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getRandomOpponentName() {
  var names = [
    'GeoMaster69', 'MapHunter', 'WorldExplorer', 'StreetViewPro', 'GeographyKing',
    'LocationLegend', 'PinPointGod', 'AtlasAce', 'CompassCrush', 'NavigatorNinja',
    'EarthExpert', 'GlobeGamer', 'CoordinateKid', 'LatLongLord', 'MapManiac'
  ];
  return names[Math.floor(Math.random() * names.length)];
}

// Funkcje WebSocket
function connectToWebSocket() {
  if (multiplayerState.socket) {
    multiplayerState.socket.disconnect();
  }

  if (typeof io === 'undefined') {
    showBattleNotification("❌ Błąd!", "Socket.IO nie jest dostępny. Odśwież stronę.");
    return false;
  }

  try {
    // Połącz z serwerem WebSocket z retry logic
    multiplayerState.socket = io(window.location.origin, {
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000
    });

    // Event listenery
    multiplayerState.socket.on('connect', () => {
      console.log('Połączono z serwerem!');
      showBattleNotification("🔌 Połączono!", "Gotowy do gry online!");
    });

    multiplayerState.socket.on('disconnect', (reason) => {
      console.log('Rozłączono z serwerem:', reason);
      showBattleNotification("⚠️ Rozłączono", "Utracono połączenie z serwerem");
    });

    multiplayerState.socket.on('connect_error', (error) => {
      console.error('Błąd połączenia WebSocket:', error);
      showBattleNotification("❌ Błąd połączenia!", "Spróbuj ponownie za chwilę");
    });

  multiplayerState.socket.on('joinError', (message) => {
    showBattleNotification("❌ Błąd!", message);
  });

  multiplayerState.socket.on('playerJoined', (data) => {
    multiplayerState.players = data.players;

    if (data.players.length >= 1 && !multiplayerState.isHost) {
      // Jeśli dołączamy do istniejącego pokoju, pokaż waiting room
      const host = data.players.find(p => p.isHost);
      if (host) {
        document.querySelector('.multiplayer-modes').style.display = 'none';
        document.getElementById('waiting-room').style.display = 'block';
        document.getElementById('current-room-code').textContent = multiplayerState.roomCode;

        // Pokaż hosta w pierwszym slocie
        document.querySelector('#waiting-room .player-slot.filled .player-name').textContent = `${host.name} (Host)`;

        // Pokaż siebie w drugim slocie
        document.getElementById('opponent-slot').classList.add('filled');
        document.getElementById('opponent-slot').innerHTML = `
          <div class="player-avatar">👤</div>
          <div class="player-name">${multiplayerState.myNickname} (Ty)</div>
        `;

        showBattleNotification("🎮 Dołączono do pokoju!", `Jesteś w pokoju z: ${host.name}`);
      }
    }

    if (data.players.length === 2) {
      const opponent = data.players.find(p => p.id !== multiplayerState.socket.id);
      multiplayerState.opponentName = opponent ? opponent.name : 'Przeciwnik';

      if (multiplayerState.isHost) {
        // Jeśli jesteśmy hostem, pokaż nowego gracza w drugim slocie
        document.getElementById('opponent-slot').classList.add('filled');
        document.getElementById('opponent-slot').innerHTML = `
          <div class="player-avatar">👤</div>
          <div class="player-name">${multiplayerState.opponentName}</div>
        `;
        document.getElementById('start-game-btn').disabled = false;

        showBattleNotification("🎮 Gracz dołączył!", `${multiplayerState.opponentName} jest gotowy!`);
      }
    }
  });

  multiplayerState.socket.on('playerLeft', (data) => {
    multiplayerState.players = data.players;
    showBattleNotification("👋 Gracz opuścił", "Przeciwnik wyszedł z pokoju");

    document.getElementById('opponent-slot').classList.remove('filled');
    document.getElementById('opponent-slot').innerHTML = `
      <div class="player-avatar">👤</div>
      <div class="player-name">Czekam na gracza...</div>
    `;
    document.getElementById('start-game-btn').disabled = true;
  });

  multiplayerState.socket.on('gameStarted', (data) => {
    multiplayerState.currentRound = data.currentRound;
    multiplayerState.maxRounds = data.maxRounds;
    currentLocation = data.location;

    // Ukryj multiplayer i pokaż grę
    document.getElementById("multiplayer").style.display = "none";
    document.getElementById("game-container").style.display = "block";
    document.getElementById("mp-scoreboard").style.display = "flex";

    // Ukryj przycisk sklepu w multiplayer
    document.getElementById("shop-button-game").style.display = "none";

    initMultiplayerMaps();
    startRealMultiplayerRound();
  });

  multiplayerState.socket.on('opponentGuessed', (data) => {
    showBattleNotification("🎯 Przeciwnik zgadł!", `${data.playerName} wysłał odpowiedź`);
    updateScoreboard("opponent-guessed");
  });

  multiplayerState.socket.on('roundResults', (data) => {
    multiplayerState.players = data.players;
    const me = data.players.find(p => p.id === multiplayerState.socket.id);
    const opponent = data.players.find(p => p.id !== multiplayerState.socket.id);

    multiplayerState.myScore = me ? me.score : 0;
    multiplayerState.opponentScore = opponent ? opponent.score : 0;

    showRealMultiplayerResults(me, opponent, data.location);
  });

  multiplayerState.socket.on('nextRound', (data) => {
    multiplayerState.currentRound = data.currentRound;
    currentLocation = data.location;
    multiplayerState.myGuess = null;
    startRealMultiplayerRound();
  });

  multiplayerState.socket.on('gameEnded', (data) => {
    endRealMultiplayerGame(data.winner, data.players);
  });

  // Nasłuchuj aktualizacji awatarów innych użytkowników
  multiplayerState.socket.on('userAvatarUpdated', (data) => {
    // Zaktualizuj cache lokalny awatara
    localStorage.setItem(`monkiguessr-avatar-${data.username}`, data.avatar);
    
    // Zaktualizuj awatar w interfejsie jeśli jest widoczny
    updateUserAvatarInUI(data.username, data.avatar);
    
    showSettingsNotification("🔄 Awatar zaktualizowany!", `${data.username} zmienił swoje zdjęcie profilowe`, 'success');
  });
}

function startRealMultiplayerRound() {
  mapLocked = false;
  const resultBox = document.getElementById("result-box");
  const resultOverlay = document.getElementById("result-overlay");
  resultBox.classList.remove('show', 'game-over');
  resultBox.style.display = "none";
  resultOverlay.classList.remove('show');
  resultOverlay.style.display = "none";
  document.getElementById("next-button").style.display = "none";
  document.getElementById("guess-button").style.display = "block";
  document.getElementById("instruction").style.display = "block";
  document.getElementById("instruction").innerText = `⚔️ PRAWDZIWY PvP - RUNDA ${multiplayerState.currentRound} - Zgadnij!`;

  resetMarkers();
  cleanupTempMarkers();
  updateScoreboard();

  const svService = new google.maps.StreetViewService();
  svService.getPanorama({ location: currentLocation, radius: 100 }, (data, status) => {
    if (status === "OK") {
      panorama = new google.maps.StreetViewPanorama(
        document.getElementById("street-view"),
        {
          pano: data.location.pano,
          addressControl: false,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
          fullscreenControl: false,
          clickToGo: true,
          scrollwheel: true,
          disableDoubleClickZoom: false,
          keyboardShortcuts: true
        }
      );
    }
  });

  timeLeft = 90;
  updateTimerDisplay();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      makeRealMultiplayerGuess(true);
    }
  }, 1000);
}

function makeRealMultiplayerGuess(timeUp = false) {
  if (mapLocked) return;
  mapLocked = true;
  clearInterval(timerInterval);

  const guess = multiplayerState.myGuess ? {
    lat: multiplayerState.myGuess.lat(),
    lng: multiplayerState.myGuess.lng()
  } : null;

  multiplayerState.socket.emit('submitGuess', {
    roomCode: multiplayerState.roomCode,
    guess: guess
  });

  updateScoreboard("waiting");

  if (timeUp) {
    showBattleNotification("⏰ Czas minął!", "Automatyczne wysłanie odpowiedzi");
  } else {
    showBattleNotification("✅ Wysłano!", "Czekam na przeciwnika...");
  }

  document.getElementById("instruction").innerText = "⏳ Czekam na przeciwnika...";
  document.getElementById("guess-button").style.display = "none";
}

function showRealMultiplayerResults(me, opponent, location) {
  // Pokaż markery
  if (me && me.guess) {
    if (guessMarker) guessMarker.setMap(null);
    guessMarker = new google.maps.Marker({
      position: me.guess,
      map: guessMap,
      label: "🎯",
    });
  }

  if (opponent && opponent.guess) {
    const opponentMarker = new google.maps.Marker({
      position: opponent.guess,
      map: guessMap,
      label: "👤",
    });

    if (!multiplayerState.tempMarkers) {
      multiplayerState.tempMarkers = [];
    }
    multiplayerState.tempMarkers.push(opponentMarker);
  }

  realMarker = new google.maps.Marker({
    position: location,
    map: guessMap,
    label: "📍",
  });

  // Linie
  if (me && me.guess) {
    const myLine = new google.maps.Polyline({
      path: [me.guess, location],
      geodesic: true,
      strokeColor: "#00FF00",
      strokeOpacity: 1,
      strokeWeight: 3,
      map: guessMap
    });
    multiplayerState.tempMarkers.push(myLine);
  }

  if (opponent && opponent.guess) {
    const opponentLine = new google.maps.Polyline({
      path: [opponent.guess, location],
      geodesic: true,
      strokeColor: "#FF0000",
      strokeOpacity: 1,
      strokeWeight: 3,
      map: guessMap
    });
    multiplayerState.tempMarkers.push(opponentLine);
  }

  updateScoreboard();
  showRealMultiplayerRoundResult(me, opponent);
}

function showRealMultiplayerRoundResult(me, opponent) {
  const resultBox = document.getElementById("result-box");
  const resultOverlay = document.getElementById("result-overlay");

  let winner = "";

  if (!me || !opponent) {
    winner = "❌ Błąd gry";
  } else if (me.points > opponent.points) {
    winner = "🏆 WYGRAŁEŚ RUNDĘ!";
  } else if (opponent.points > me.points) {
    winner = "💀 PRZEGRAŁEŚ RUNDĘ!";
  } else {
    winner = "🤝 REMIS!";
  }

  const myDistance = me ? me.distance : 0;
  const myPoints = me ? me.points : 0;
  const opponentDistance = opponent ? opponent.distance : 0;
  const opponentPoints = opponent ? opponent.points : 0;

  resultBox.innerHTML = `
    <div class="result-line game-over-title">${winner}</div>
    <div class="result-line">
      <div style="display: flex; justify-content: space-between; margin: 20px 0;">
        <div style="text-align: center;">
          <div style="color: #00FF00; font-size: 1.2em;">🎯 TY</div>
          <div>${myDistance.toFixed(2)} km</div>
          <div>🏆 ${myPoints} pkt</div>
        </div>
        <div style="text-align: center;">
          <div style="color: #FF0000; font-size: 1.2em;">👤 ${multiplayerState.opponentName}</div>
          <div>${opponentDistance.toFixed(2)} km</div>
          <div>🏆 ${opponentPoints} pkt</div>
        </div>
      </div>
    </div>
    <div class="result-line">Runda ${multiplayerState.currentRound}/${multiplayerState.maxRounds}</div>
    <div class="result-line" style="color: #ffd700;">⚡ PRAWDZIWY MULTIPLAYER! ⚡</div>
    <div class="result-line" id="location-name">🌍 Sprawdzam lokalizację...</div>
  `;

  resultOverlay.style.display = "block";
  resultBox.style.display = "block";

  setTimeout(() => {
    resultOverlay.classList.add('show');
    resultBox.classList.add('show');

    // Pobierz nazwę miasta
    getCityName(currentLocation);
  }, 50);

  document.getElementById("guess-button").style.display = "none";
}

function endRealMultiplayerGame(winner, players) {
  const me = players.find(p => p.id === multiplayerState.socket.id);
  const opponent = players.find(p => p.id !== multiplayerState.socket.id);

  let gameResult = "";
  let resultClass = "";
  let pointsEarned = 0;
  let mpResult = null;

  if (winner.id === multiplayerState.socket.id) {
    gameResult = "🏆 ZWYCIĘSTWO!";
    resultClass = "victory";
    multiplayerStats.wins++;
    multiplayerStats.points += 1000;
    pointsEarned = (me ? me.score : 0) + 2000; // Punkty z gry + bonus za wygraną
    mpResult = 'win';
    soundSystem.playVictory(); // Dźwięk zwycięstwa
  } else {
    gameResult = "💀 PORAŻKA!";
    resultClass = "defeat";
    multiplayerStats.losses++;
    pointsEarned = (me ? me.score : 0) + 500; // Punkty z gry + pocieszenie
    mpResult = 'loss';
    soundSystem.playDefeat(); // Dźwięk porażki
  }

  // Dodaj punkty do totalPoints
  totalPoints += pointsEarned;
  
  // Zaktualizuj statystyki na serwerze
  if (currentUser) {
    updateUserMultiplayerStats(pointsEarned, mpResult);
  }

  // Zapisz statystyki lokalnie i zaktualizuj wyświetlanie
  saveMultiplayerStats();
  updateTotalPointsDisplay();

  const resultBox = document.getElementById("result-box");
  resultBox.innerHTML = `
    <div class="result-line game-over-title ${resultClass}">${gameResult}</div>
    <div class="result-line">
      <div style="display: flex; justify-content: space-between; margin: 30px 0;">
        <div style="text-align: center;">
          <div style="color: #00FF00; font-size: 1.5em;">🎯 TY</div>
          <div style="font-size: 2em; margin: 10px 0;">${me ? me.score : 0}</div>
          <div>PUNKTÓW</div>
        </div>
        <div style="text-align: center; font-size: 3em; color: #ffd700;">VS</div>
        <div style="text-align: center;">
          <div style="color: #FF0000; font-size: 1.5em;">👤 ${opponent ? opponent.name : 'Przeciwnik'}</div>
          <div style="font-size: 2em; margin: 10px 0;">${opponent ? opponent.score : 0}</div>
          <div>PUNKTÓW</div>
        </div>
      </div>
    </div>
    <div class="result-line" style="color: #ffd700; font-size: 1.2em;">⚡ PRAWDZIWY MULTIPLAYER! ⚡</div>
    <div style="margin-top: 20px;">
      <button onclick="backToMultiplayerMenu()" style="
        background: linear-gradient(45deg, #3498db, #2980b9);
        color: white;
        border: none;
        border-radius: 25px;
        padding: 15px 30px;
        font-family: 'Titan One', cursive;
        font-size: 1.2em;
        cursor: pointer;
        margin: 10px;
      ">🔄 Nowa walka</button>
      <button onclick="showMainMenu()" style="
        background: linear-gradient(45deg, #95a5a6, #7f8c8d);
        color: white;
        border: none;
        border-radius: 25px;
        padding: 15px 30px;
        font-family: 'Titan One', cursive;
        font-size: 1.2em;
        cursor: pointer;
        margin: 10px;
      ">🏠 Menu główne</button>
    </div>
  `;
}

function getCityName(location) {
  const geocoder = new google.maps.Geocoder();
  const latLng = new google.maps.LatLng(location.lat, location.lng);

  geocoder.geocode({ location: latLng }, (results, status) => {
    const locationNameElement = document.getElementById('location-name');

    if (status === 'OK' && results[0]) {
      // Znajdź najbardziej odpowiedni komponent adresu
      let cityName = '';
      let countryName = '';

      // Przeszukaj komponenty adresu
      for (let i = 0; i < results.length; i++) {
        const result = results[i];

        for (let j = 0; j < result.address_components.length; j++) {
          const component = result.address_components[j];
          const types = component.types;

          // Szukaj miasta
          if (types.includes('locality') || types.includes('administrative_area_level_2') || types.includes('administrative_area_level_1')) {
            if (!cityName) cityName = component.long_name;
          }

          // Szukaj kraju
          if (types.includes('country')) {
            countryName = component.long_name;
          }
        }

        // Jeśli znaleźliśmy miasto i kraj, przerwij
        if (cityName && countryName) break;
      }

      // Stwórz tekst lokalizacji
      let locationText = '🌍 ';
      if (cityName && countryName) {
        locationText += `${cityName}, ${countryName}`;
      } else if (countryName) {
        locationText += countryName;
      } else if (cityName) {
        locationText += cityName;
      } else {
        // Fallback - użyj pierwszego dostępnego adresu
        const address = results[0].formatted_address;
        const parts = address.split(',');
        locationText += parts.length > 1 ? parts.slice(-2).join(',').trim() : address;
      }

      if (locationNameElement) {
        locationNameElement.innerHTML = locationText;
      }
    } else {
      if (locationNameElement) {
        locationNameElement.innerHTML = '🌍 Nieznana lokalizacja';
      }
    }
  });
}

function showBattleNotification(title, description) {
  const notificationData = {
    type: 'success',
    html: `
      <div class="notification-icon">⚔️</div>
      <div class="notification-text">
        <div class="notification-title">${title}</div>
        <div class="notification-desc">${description}</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

function updateStarPinSticker() {
  const gameContainer = document.getElementById('game-container');

  // Usuń istniejącą naklejkę
  const existingSticker = document.getElementById('star-pin-sticker');
  if (existingSticker) {
    existingSticker.remove();
  }

  if (inventory.starPin && gameContainer) {
    // Stwórz element naklejki
    const sticker = document.createElement('div');
    sticker.id = 'star-pin-sticker';
    sticker.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      z-index: 10;
      width: 64px;
      height: 64px;
      background: url('star-pin.png') no-repeat center center; /* Zmień na ścieżkę do twojego obrazka */
      background-size: contain;
      animation: pulsate 2s ease-in-out infinite, rotate 5s linear infinite;
      cursor: pointer;
    `;

    // Dodaj tooltip
    sticker.title = "Masz Gwiezdny Pin!";

    // Dodaj event listener (opcjonalnie)
    sticker.addEventListener('click', () => {
      showEffectNotification("✨ Gwiezdny Pin!", "Gratulacje, masz unikalną przypinkę!");
    });

    // Dodaj naklejkę do kontenera gry
    gameContainer.appendChild(sticker);
  }
}

// System topki graczy
function openLeaderboard() {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("leaderboard").style.display = "flex";
  loadLeaderboard();
}

function closeLeaderboard() {
  document.getElementById("leaderboard").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
}

async function loadLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    const data = await response.json();
    
    if (data.success) {
      displayLeaderboard(data.players);
    } else {
      showLeaderboardError("Nie udało się załadować topki graczy");
    }
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    showLeaderboardError("Błąd połączenia z serwerem");
  }
}

function displayLeaderboard(players) {
  const leaderboardList = document.getElementById('leaderboard-list');
  
  if (!players || players.length === 0) {
    leaderboardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <div class="empty-title">Brak graczy</div>
        <div class="empty-desc">Zostań pierwszym graczem w topce!</div>
      </div>
    `;
    return;
  }
  
  leaderboardList.innerHTML = '';
  
  players.forEach((player, index) => {
    const playerLevel = calculateLevel(player.totalExp || 0);
    const position = index + 1;
    let medalIcon = '';
    let cardClass = 'leaderboard-card';
    
    if (position === 1) {
      medalIcon = '🥇';
      cardClass += ' gold';
    } else if (position === 2) {
      medalIcon = '🥈';
      cardClass += ' silver';
    } else if (position === 3) {
      medalIcon = '🥉';
      cardClass += ' bronze';
    } else {
      medalIcon = `#${position}`;
    }
    
    const isCurrentUser = currentUser && currentUser.username === player.username;
    if (isCurrentUser) {
      cardClass += ' current-user';
    }
    
    const playerCard = document.createElement('div');
    playerCard.className = cardClass;
    
    playerCard.innerHTML = `
      <div class="leaderboard-position">${medalIcon}</div>
      <div class="leaderboard-player-info">
        <div class="leaderboard-player-name">
          ${player.username}
          ${isCurrentUser ? '<span class="you-indicator">(TY)</span>' : ''}
        </div>
        <div class="leaderboard-player-stats">
          <div class="stat-item">⭐ Poziom ${playerLevel.level}</div>
          <div class="stat-item">✨ ${player.totalExp || 0} EXP</div>
          <div class="stat-item">🏆 ${player.totalPoints.toLocaleString()} pkt</div>
        </div>
      </div>
      <div class="leaderboard-level">
        <div class="level-star">⭐</div>
        <div class="level-number">${playerLevel.level}</div>
      </div>
    `;
    
    leaderboardList.appendChild(playerCard);
  });
}

function showLeaderboardError(message) {
  const leaderboardList = document.getElementById('leaderboard-list');
  leaderboardList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">❌</div>
      <div class="empty-title">Błąd</div>
      <div class="empty-desc">${message}</div>
    </div>
  `;
}

// System znajomych
function openFriends() {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("friends").style.display = "flex";
  loadFriendsData();
  updateFriendsDisplay();
}

function closeFriends() {
  document.getElementById("friends").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
}

function switchFriendsTab(tab) {
  friendsCurrentTab = tab;
  
  // Aktualizuj zakładki
  const tabs = document.querySelectorAll('.friends-tab');
  tabs.forEach(t => t.classList.remove('active'));
  
  const contents = document.querySelectorAll('.friends-content');
  contents.forEach(c => c.style.display = 'none');
  
  if (tab === 'friends') {
    tabs[0].classList.add('active');
    document.getElementById('friends-list').style.display = 'block';
    displayFriendsList();
  } else if (tab === 'add') {
    tabs[1].classList.add('active');
    document.getElementById('add-friend').style.display = 'block';
  } else if (tab === 'invitations') {
    tabs[2].classList.add('active');
    document.getElementById('invitations').style.display = 'block';
    displayInvitations();
  }
}

function saveMultiplayerStats() {
  if (currentUser) {
    // Zapisz statystyki na koncie użytkownika
    localStorage.setItem(`monkiguessr-mp-stats-${currentUser.username}`, JSON.stringify(multiplayerStats));
  } else {
    // Fallback do lokalnego storage
    localStorage.setItem('mp-wins', multiplayerStats.wins.toString());
    localStorage.setItem('mp-losses', multiplayerStats.losses.toString());
    localStorage.setItem('mp-points', multiplayerStats.points.toString());
  }
}

function loadMultiplayerStats() {
  if (currentUser) {
    const saved = localStorage.getItem(`monkiguessr-mp-stats-${currentUser.username}`);
    if (saved) {
      try {
        multiplayerStats = JSON.parse(saved);
        return;
      } catch (e) {
        console.error('Error loading multiplayer stats:', e);
      }
    }
    // Jeśli nie ma zapisanych statystyk dla tego użytkownika, załaduj z serwera
    loadMultiplayerStatsFromServer();
  } else {
    // Fallback do localStorage
    multiplayerStats = {
      wins: parseInt(localStorage.getItem('mp-wins') || '0'),
      losses: parseInt(localStorage.getItem('mp-losses') || '0'),
      points: parseInt(localStorage.getItem('mp-points') || '0')
    };
  }
}

async function loadMultiplayerStatsFromServer() {
  if (!currentUser) return;
  
  try {
    const response = await fetch('/api/get-multiplayer-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: currentUser.username })
    });
    
    const data = await response.json();
    
    if (data.success) {
      multiplayerStats = {
        wins: data.stats.mpWins || 0,
        losses: data.stats.mpLosses || 0,
        points: data.stats.mpPoints || 0
      };
      saveMultiplayerStats(); // Zapisz lokalnie dla cache
    }
  } catch (error) {
    console.error('Error loading multiplayer stats from server:', error);
  }
}

async function updateUserMultiplayerStats(points, gameResult) {
  if (!currentUser) {
    console.log('Brak zalogowanego użytkownika - statystyki multiplayer nie będą zapisane na serwerze');
    return;
  }
  
  console.log(`Aktualizuję statystyki MP dla ${currentUser.username}: +${points} punktów, wynik: ${gameResult}`);
  
  try {
    const response = await fetch('/api/update-multiplayer-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: currentUser.username,
        points: points,
        gameResult: gameResult
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Statystyki MP zaktualizowane na serwerze:', data.user);
      
      // Zaktualizuj statystyki główne użytkownika
      currentUser = data.user;
      localStorage.setItem('monkiguessr-user', JSON.stringify(currentUser));
      
      // Zaktualizuj interfejs
      const totalPointsEl = document.getElementById('user-total-points');
      const gamesPlayedEl = document.getElementById('user-games-played');
      
      if (totalPointsEl) totalPointsEl.textContent = currentUser.totalPoints.toLocaleString();
      if (gamesPlayedEl) gamesPlayedEl.textContent = currentUser.gamesPlayed;
      
      totalPoints = currentUser.totalPoints;
      updateTotalPointsDisplay();
      
      // Zaktualizuj statystyki multiplayer z serwera
      multiplayerStats = {
        wins: data.user.mpWins || 0,
        losses: data.user.mpLosses || 0,
        points: data.user.mpPoints || 0
      };
      saveMultiplayerStats();
      updateMultiplayerStats();
      
      showBattleNotification("✅ Statystyki zapisane!", `+${points} punktów dodane do konta!`);
    } else {
      console.error('Błąd aktualizacji statystyk MP:', data.message);
      showBattleNotification("⚠️ Błąd zapisu!", "Statystyki mogą nie być zsynchronizowane", 'error');
    }
  } catch (error) {
    console.error('Error updating multiplayer stats:', error);
    showBattleNotification("❌ Błąd połączenia!", "Statystyki zostały zapisane lokalnie", 'error');
  }
}

function loadFriendsData() {
  if (!currentUser) return;
  
  const saved = localStorage.getItem(`monkiguessr-friends-${currentUser.username}`);
  if (saved) {
    try {
      friendsData = JSON.parse(saved);
    } catch (e) {
      friendsData = {
        friends: [],
        pendingInvitations: [],
        sentInvitations: []
      };
    }
  }
}

function saveFriendsData() {
  if (!currentUser) return;
  
  localStorage.setItem(`monkiguessr-friends-${currentUser.username}`, JSON.stringify(friendsData));
}

function updateFriendsDisplay() {
  document.getElementById('friends-count').textContent = friendsData.friends.length;
  document.getElementById('invitations-count').textContent = friendsData.pendingInvitations.length;
  
  if (friendsCurrentTab === 'friends') {
    displayFriendsList();
  } else if (friendsCurrentTab === 'invitations') {
    displayInvitations();
  }
}

async function displayFriendsList() {
  const emptyState = document.getElementById('empty-friends');
  const friendsGrid = document.getElementById('friends-grid');
  
  if (friendsData.friends.length === 0) {
    emptyState.style.display = 'block';
    friendsGrid.style.display = 'none';
    return;
  }
  
  emptyState.style.display = 'none';
  friendsGrid.style.display = 'grid';
  
  friendsGrid.innerHTML = '';
  
  for (const friend of friendsData.friends) {
    const friendCard = document.createElement('div');
    friendCard.className = 'friend-card';
    
    const isOnline = Math.random() > 0.5; // Symulacja statusu online
    const avatar = await getUserAvatar(friend.username);
    
    friendCard.innerHTML = `
      <div class="friend-header">
        <div class="friend-avatar-container">
          <img src="${avatar}" alt="${friend.username}" class="friend-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="friend-avatar-fallback" style="display: none;">👤</div>
        </div>
        <div class="friend-info">
          <div class="friend-name">${friend.username}</div>
          <div class="friend-status ${isOnline ? 'online' : 'offline'}">
            ${isOnline ? '🟢 Online' : '⚫ Offline'}
          </div>
        </div>
      </div>
      <div class="friend-actions">
        <button class="friend-btn invite-btn" onclick="inviteToGame('${friend.username}')">
          ⚔️ Zaproś na walkę
        </button>
        <button class="friend-btn remove-btn" onclick="removeFriend('${friend.username}')">
          🗑️ Usuń
        </button>
      </div>
    `;
    
    friendsGrid.appendChild(friendCard);
  }
}

async function searchUser() {
  const username = document.getElementById('friend-username').value.trim();
  const resultsContainer = document.getElementById('search-results');
  
  if (!username) {
    showFriendsNotification("❌ Błąd!", "Wpisz nick gracza do wyszukania", 'error');
    return;
  }
  
  if (username === currentUser.username) {
    showFriendsNotification("❌ Błąd!", "Nie możesz dodać siebie do znajomych!", 'error');
    return;
  }
  
  // Sprawdź czy już jest w znajomych
  if (friendsData.friends.some(f => f.username === username)) {
    showFriendsNotification("❌ Już dodany!", "Ten gracz jest już w twojej liście znajomych", 'error');
    return;
  }
  
  try {
    // Sprawdź czy użytkownik istnieje na serwerze
    const response = await fetch('/api/search-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: username })
    });
    
    const data = await response.json();
    
    if (data.success) {
      const foundUser = data.user;
      const avatar = await getUserAvatar(foundUser.username);
      
      resultsContainer.innerHTML = `
        <div class="user-result">
          <div class="user-result-info">
            <div class="user-result-avatar-container">
              <img src="${avatar}" alt="${foundUser.username}" class="user-result-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div class="user-result-avatar-fallback" style="display: none;">👤</div>
            </div>
            <div>
              <div class="user-result-name">${foundUser.username}</div>
              <div style="color: rgba(255,255,255,0.7); font-size: 0.9em;">
                🏆 ${foundUser.totalPoints.toLocaleString()} pkt | 🎮 ${foundUser.gamesPlayed} gier
              </div>
            </div>
          </div>
          <button class="add-friend-btn" onclick="addFriend('${foundUser.username}')">
            ➕ Dodaj do znajomych
          </button>
        </div>
      `;
      
      showFriendsNotification("✅ Znaleziono!", `Gracz ${username} został odnaleziony`, 'success');
    } else {
      showFriendsNotification("❌ Nie znaleziono!", data.message || "Gracz o tym nicku nie istnieje", 'error');
    }
  } catch (error) {
    console.error('Error searching user:', error);
    showFriendsNotification("❌ Błąd!", "Błąd połączenia z serwerem", 'error');
  }
}

function addFriend(username) {
  if (!currentUser) {
    showFriendsNotification("❌ Błąd!", "Musisz być zalogowany!", 'error');
    return;
  }
  
  // Dodaj do listy znajomych
  friendsData.friends.push({
    username: username,
    addedAt: new Date().toISOString()
  });
  
  saveFriendsData();
  updateFriendsDisplay();
  
  showFriendsNotification("✅ Dodano!", `${username} został dodany do znajomych!`, 'success');
  
  // Wyczyść wyniki wyszukiwania
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('friend-username').value = '';
}

function removeFriend(username) {
  if (confirm(`Czy na pewno chcesz usunąć ${username} z listy znajomych?`)) {
    friendsData.friends = friendsData.friends.filter(f => f.username !== username);
    saveFriendsData();
    updateFriendsDisplay();
    
    showFriendsNotification("🗑️ Usunięto!", `${username} został usunięty z znajomych`, 'success');
  }
}

function inviteToGame(username) {
  // Symulacja wysłania zaproszenia
  showFriendsNotification("📨 Wysłano!", `Zaproszenie do walki zostało wysłane do ${username}`, 'success');
  
  // Dodaj do wysłanych zaproszeń
  friendsData.sentInvitations.push({
    username: username,
    sentAt: new Date().toISOString(),
    type: 'game_invite'
  });
  
  saveFriendsData();
  
  // Symulacja otrzymania zaproszenia przez przeciwnika (dla demonstracji)
  setTimeout(() => {
    if (Math.random() > 0.3) { // 70% szans na przyjęcie
      showFriendsNotification("✅ Przyjęto!", `${username} przyjął zaproszenie do walki!`, 'success');
      
      // Automatycznie uruchom multiplayer
      setTimeout(() => {
        openMultiplayer();
        multiplayerState.isHost = true;
        multiplayerState.isMultiplayer = true;
        multiplayerState.roomCode = generateRoomCode();
        multiplayerState.opponentName = username;
        
        showBattleNotification("⚔️ Gotowy do walki!", `${username} dołączył do twojego pokoju`);
        
        setTimeout(() => {
          startMultiplayerGame();
        }, 2000);
      }, 1500);
    } else {
      showFriendsNotification("❌ Odrzucono", `${username} odrzucił zaproszenie`, 'error');
    }
  }, Math.random() * 3000 + 2000);
}

function displayInvitations() {
  const emptyState = document.getElementById('empty-invitations');
  const invitationsGrid = document.getElementById('invitations-grid');
  
  if (friendsData.pendingInvitations.length === 0) {
    emptyState.style.display = 'block';
    invitationsGrid.style.display = 'none';
    return;
  }
  
  emptyState.style.display = 'none';
  invitationsGrid.style.display = 'grid';
  
  invitationsGrid.innerHTML = '';
  
  friendsData.pendingInvitations.forEach((invitation, index) => {
    const invitationCard = document.createElement('div');
    invitationCard.className = 'invitation-card';
    
    invitationCard.innerHTML = `
      <div class="invitation-header">
        <div class="invitation-icon">⚔️</div>
        <div class="invitation-info">
          <div class="invitation-title">Zaproszenie do walki</div>
          <div class="invitation-desc">
            ${invitation.username} zaprasza Cię na pojedynek!
          </div>
        </div>
      </div>
      <div class="invitation-actions">
        <button class="accept-btn" onclick="acceptInvitation(${index})">
          ✅ Przyjmij
        </button>
        <button class="decline-btn" onclick="declineInvitation(${index})">
          ❌ Odrzuć
        </button>
      </div>
    `;
    
    invitationsGrid.appendChild(invitationCard);
  });
}

function acceptInvitation(index) {
  const invitation = friendsData.pendingInvitations[index];
  
  showFriendsNotification("✅ Przyjęto!", `Dołączasz do walki z ${invitation.username}!`, 'success');
  
  // Usuń zaproszenie z listy
  friendsData.pendingInvitations.splice(index, 1);
  saveFriendsData();
  updateFriendsDisplay();
  
  // Uruchom multiplayer
  setTimeout(() => {
    openMultiplayer();
    multiplayerState.isHost = false;
    multiplayerState.isMultiplayer = true;
    multiplayerState.roomCode = generateRoomCode();
    multiplayerState.opponentName = invitation.username;
    
    showBattleNotification("⚔️ Dołączanie do walki!", `Połączenie z ${invitation.username}`);
    
    setTimeout(() => {
      startMultiplayerGame();
    }, 2000);
  }, 1500);
}

function declineInvitation(index) {
  const invitation = friendsData.pendingInvitations[index];
  
  showFriendsNotification("❌ Odrzucono", `Odrzuciłeś zaproszenie od ${invitation.username}`, 'success');
  
  // Usuń zaproszenie z listy
  friendsData.pendingInvitations.splice(index, 1);
  saveFriendsData();
  updateFriendsDisplay();
}

function showFriendsNotification(title, description, type = 'success') {
  const notificationData = {
    type: type,
    html: `
      <div class="notification-icon">${type === 'success' ? '👥' : '❌'}</div>
      <div class="notification-text">
        <div class="notification-title">${title}</div>
        <div class="notification-desc">${description}</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

// Symulacja otrzymywania zaproszeń od znajomych (dla demonstracji)
function simulateIncomingInvitation() {
  if (!currentUser || friendsData.friends.length === 0) return;
  
  const randomFriend = friendsData.friends[Math.floor(Math.random() * friendsData.friends.length)];
  
  friendsData.pendingInvitations.push({
    username: randomFriend.username,
    receivedAt: new Date().toISOString(),
    type: 'game_invite'
  });
  
  saveFriendsData();
  updateFriendsDisplay();
  
  showFriendsNotification("📨 Nowe zaproszenie!", `${randomFriend.username} zaprasza Cię na walkę!`, 'success');
}

// Symuluj losowe zaproszenia co jakiś czas (dla demonstracji)
setInterval(() => {
  if (Math.random() > 0.95 && currentUser && friendsData.friends.length > 0) {
    simulateIncomingInvitation();
  }
}, 30000); // Co 30 sekund 5% szans na zaproszenie

// System ustawień
var settingsCurrentTab = 'profile';
var userPreferences = {
  soundEffects: true,
  backgroundMusic: false,
  autoNextRound: true,
  showDistance: true,
  friendNotifications: true,
  gameInvites: true
};

// PWA Installation
var deferredPrompt;
var isAppInstalled = false;

// Sprawdź czy app jest już zainstalowany
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
  isAppInstalled = true;
}

function openSettings() {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("settings").style.display = "flex";
  loadUserSettings();
  updateSettingsDisplay();
}

function closeSettings() {
  document.getElementById("settings").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
}

function switchSettingsTab(tab) {
  settingsCurrentTab = tab;
  
  // Aktualizuj zakładki
  const tabs = document.querySelectorAll('.settings-tab');
  tabs.forEach(t => t.classList.remove('active'));
  
  const contents = document.querySelectorAll('.settings-content');
  contents.forEach(c => c.style.display = 'none');
  
  if (tab === 'profile') {
    tabs[0].classList.add('active');
    document.getElementById('profile-settings').style.display = 'block';
    updateProfileDisplay();
  } else if (tab === 'stats') {
    tabs[1].classList.add('active');
    document.getElementById('stats-settings').style.display = 'block';
    updateStatsDisplay();
  } else if (tab === 'preferences') {
    tabs[2].classList.add('active');
    document.getElementById('preferences-settings').style.display = 'block';
    updatePreferencesDisplay();
  }
}

function loadUserSettings() {
  if (!currentUser) return;
  
  // Załaduj preferencje z localStorage
  const saved = localStorage.getItem(`monkiguessr-preferences-${currentUser.username}`);
  if (saved) {
    try {
      userPreferences = { ...userPreferences, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading preferences:', e);
    }
  }
}

function updateSettingsDisplay() {
  if (settingsCurrentTab === 'profile') {
    updateProfileDisplay();
  } else if (settingsCurrentTab === 'stats') {
    updateStatsDisplay();
  } else if (settingsCurrentTab === 'preferences') {
    updatePreferencesDisplay();
  }
}

function updateProfileDisplay() {
  if (!currentUser) return;
  
  document.getElementById('profile-username').textContent = currentUser.username;
  document.getElementById('profile-total-points').textContent = currentUser.totalPoints.toLocaleString();
  document.getElementById('profile-games-played').textContent = currentUser.gamesPlayed;
  
  if (currentUser.createdAt) {
    const date = new Date(currentUser.createdAt);
    document.getElementById('profile-created').textContent = date.toLocaleDateString('pl-PL');
  }
}

function updateStatsDisplay() {
  if (!currentUser) return;
  
  const wins = currentUser.wins || 0;
  const losses = currentUser.losses || 0;
  const totalGames = currentUser.gamesPlayed || 0;
  const winRatio = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : 0;
  const avgPoints = totalGames > 0 ? Math.round(currentUser.totalPoints / totalGames) : 0;
  
  document.getElementById('stats-total-points').textContent = currentUser.totalPoints.toLocaleString();
  document.getElementById('stats-games-played').textContent = totalGames;
  document.getElementById('stats-wins').textContent = wins;
  document.getElementById('stats-losses').textContent = losses;
  document.getElementById('stats-win-ratio').textContent = winRatio + '%';
  document.getElementById('stats-avg-points').textContent = avgPoints.toLocaleString();
  
  // Generuj osiągnięcia
  generateAchievements();
}

function generateAchievements() {
  const achievementsList = document.getElementById('achievements-list');
  if (!achievementsList || !currentUser) return;
  
  const achievements = [
    {
      id: 'first_game',
      name: 'Pierwszy krok',
      desc: 'Rozegraj pierwszą grę',
      icon: '🎮',
      unlocked: currentUser.gamesPlayed >= 1
    },
    {
      id: 'ten_games',
      name: 'Zaprawiony',
      desc: 'Rozegraj 10 gier',
      icon: '🏃',
      unlocked: currentUser.gamesPlayed >= 10
    },
    {
      id: 'hundred_games',
      name: 'Weteran',
      desc: 'Rozegraj 100 gier',
      icon: '🎖️',
      unlocked: currentUser.gamesPlayed >= 100
    },
    {
      id: 'first_win',
      name: 'Pierwsza wygrana',
      desc: 'Wygraj pierwszy pojedynek',
      icon: '🏆',
      unlocked: (currentUser.wins || 0) >= 1
    },
    {
      id: 'ten_wins',
      name: 'Mistrz',
      desc: 'Wygraj 10 pojedynków',
      icon: '👑',
      unlocked: (currentUser.wins || 0) >= 10
    },
    {
      id: 'rich_player',
      name: 'Bogacz',
      desc: 'Zdobądź 50,000 punktów',
      icon: '💰',
      unlocked: currentUser.totalPoints >= 50000
    },
    {
      id: 'millionaire',
      name: 'Milioner',
      desc: 'Zdobądź 1,000,000 punktów',
      icon: '💎',
      unlocked: currentUser.totalPoints >= 1000000
    },
    {
      id: 'perfect_score',
      name: 'Perfekcjonista',
      desc: 'Uzyskaj 5000 punktów w rundzie',
      icon: '🎯',
      unlocked: false // To można śledzić podczas gry
    }
  ];
  
  achievementsList.innerHTML = '';
  
  achievements.forEach(achievement => {
    const achievementElement = document.createElement('div');
    achievementElement.className = `achievement-item ${achievement.unlocked ? 'unlocked' : ''}`;
    
    achievementElement.innerHTML = `
      <div class="achievement-icon">${achievement.icon}</div>
      <div class="achievement-name">${achievement.name}</div>
      <div class="achievement-desc">${achievement.desc}</div>
    `;
    
    achievementsList.appendChild(achievementElement);
  });
}

function updatePreferencesDisplay() {
  // Ustaw checkboxy zgodnie z preferencjami
  document.getElementById('sound-effects').checked = userPreferences.soundEffects;
  document.getElementById('background-music').checked = userPreferences.backgroundMusic;
  document.getElementById('auto-next-round').checked = userPreferences.autoNextRound;
  document.getElementById('show-distance').checked = userPreferences.showDistance;
  document.getElementById('friend-notifications').checked = userPreferences.friendNotifications;
  document.getElementById('game-invites').checked = userPreferences.gameInvites;
}

function savePreferences() {
  if (!currentUser) return;
  
  // Pobierz wartości z checkboxów
  userPreferences.soundEffects = document.getElementById('sound-effects').checked;
  userPreferences.backgroundMusic = document.getElementById('background-music').checked;
  userPreferences.autoNextRound = document.getElementById('auto-next-round').checked;
  userPreferences.showDistance = document.getElementById('show-distance').checked;
  userPreferences.friendNotifications = document.getElementById('friend-notifications').checked;
  userPreferences.gameInvites = document.getElementById('game-invites').checked;
  
  // Zapisz do localStorage
  localStorage.setItem(`monkiguessr-preferences-${currentUser.username}`, JSON.stringify(userPreferences));
  
  // Odtwórz dźwięk potwierdzenia jeśli efekty są włączone
  if (userPreferences.soundEffects) {
    soundSystem.playSuccess();
  }
  
  showSettingsNotification("✅ Zapisano!", "Ustawienia zostały zapisane", 'success');
}

function resetPreferences() {
  userPreferences = {
    soundEffects: true,
    backgroundMusic: false,
    autoNextRound: true,
    showDistance: true,
    friendNotifications: true,
    gameInvites: true
  };
  
  updatePreferencesDisplay();
  showSettingsNotification("🔄 Przywrócono!", "Ustawienia zostały zresetowane do domyślnych", 'success');
}

// System awatara
async function loadUserAvatar() {
  if (!currentUser) return;
  
  try {
    const response = await fetch('/api/get-avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: currentUser.username })
    });
    
    const data = await response.json();
    
    if (data.success && data.avatar) {
      document.getElementById('profile-avatar-img').src = data.avatar;
      // Aktualizuj awatar w localStorage dla cache
      localStorage.setItem(`monkiguessr-avatar-${currentUser.username}`, data.avatar);
    }
  } catch (error) {
    console.error('Error loading avatar:', error);
    // Fallback do localStorage
    const savedAvatar = localStorage.getItem(`monkiguessr-avatar-${currentUser.username}`);
    if (savedAvatar) {
      document.getElementById('profile-avatar-img').src = savedAvatar;
    }
  }
}

function triggerAvatarUpload() {
  console.log('triggerAvatarUpload called');
  const fileInput = document.getElementById('avatar-upload');
  if (fileInput) {
    fileInput.click();
  } else {
    console.error('Avatar upload input not found');
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Sprawdź czy to jest obraz
  if (!file.type.startsWith('image/')) {
    showSettingsNotification("❌ Błąd!", "Wybierz plik obrazu (JPG, PNG, GIF)", 'error');
    return;
  }
  
  // Sprawdź rozmiar (maksymalnie 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showSettingsNotification("❌ Błąd!", "Plik jest za duży! Maksymalny rozmiar to 5MB", 'error');
    return;
  }
  
  showSettingsNotification("📤 Wysyłanie...", "Przesyłanie zdjęcia na serwer", 'success');
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    const avatarData = e.target.result;
    
    if (!currentUser) return;
    
    try {
      // Wyślij awatar na serwer
      const response = await fetch('/api/update-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: currentUser.username, 
          avatarData: avatarData 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Zapisz awatar lokalnie i zaktualizuj interfejs
        localStorage.setItem(`monkiguessr-avatar-${currentUser.username}`, avatarData);
        document.getElementById('profile-avatar-img').src = avatarData;
        
        // Powiadom innych użytkowników przez WebSocket
        if (multiplayerState.socket && multiplayerState.socket.connected) {
          multiplayerState.socket.emit('avatarUpdated', {
            username: currentUser.username,
            avatar: avatarData
          });
        } else {
          // Jeśli nie ma połączenia WebSocket, połącz się
          connectToGlobalWebSocket();
          setTimeout(() => {
            if (multiplayerState.socket && multiplayerState.socket.connected) {
              multiplayerState.socket.emit('avatarUpdated', {
                username: currentUser.username,
                avatar: avatarData
              });
            }
          }, 1000);
        }
        
        showSettingsNotification("✅ Sukces!", "Zdjęcie profilowe zostało zmienione i jest widoczne dla wszystkich!", 'success');
      } else {
        showSettingsNotification("❌ Błąd!", data.message || "Nie udało się zapisać awatara", 'error');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      showSettingsNotification("❌ Błąd!", "Błąd połączenia z serwerem", 'error');
    }
  };
  
  reader.readAsDataURL(file);
}

function showSettingsNotification(title, description, type = 'success') {
  const notificationData = {
    type: type,
    html: `
      <div class="notification-icon">${type === 'success' ? '⚙️' : '❌'}</div>
      <div class="notification-text">
        <div class="notification-title">${title}</div>
        <div class="notification-desc">${description}</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

// Funkcja do pobierania awatara innego użytkownika
async function getUserAvatar(username) {
  // Najpierw sprawdź cache lokalny
  const cachedAvatar = localStorage.getItem(`monkiguessr-avatar-${username}`);
  if (cachedAvatar && cachedAvatar !== 'zdjecie.jpeg') {
    return cachedAvatar;
  }
  
  try {
    const response = await fetch('/api/get-avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: username })
    });
    
    const data = await response.json();
    
    if (data.success && data.avatar) {
      // Zapisz w cache
      localStorage.setItem(`monkiguessr-avatar-${username}`, data.avatar);
      return data.avatar;
    }
  } catch (error) {
    console.error('Error getting user avatar:', error);
  }
  
  // Fallback do domyślnego awatara
  return 'zdjecie.jpeg';
}

// Funkcja do aktualizacji awatara w interfejsie
function updateUserAvatarInUI(username, avatar) {
  // Znajdź wszystkie miejsca gdzie wyświetlany jest awatar tego użytkownika
  const avatarImages = document.querySelectorAll(`img[alt="${username}"]`);
  avatarImages.forEach(img => {
    img.src = avatar;
  });
  
  // Zaktualizuj w liście znajomych jeśli jest otwarta
  const friendCards = document.querySelectorAll('.friend-card');
  friendCards.forEach(card => {
    const nameElement = card.querySelector('.friend-name');
    if (nameElement && nameElement.textContent === username) {
      const avatarImg = card.querySelector('.friend-avatar-img');
      if (avatarImg) {
        avatarImg.src = avatar;
        avatarImg.style.display = 'block';
        const fallback = card.querySelector('.friend-avatar-fallback');
        if (fallback) fallback.style.display = 'none';
      }
    }
  });
}

// Połączenie WebSocket dla synchronizacji globalnej (nie tylko do gry)
function connectToGlobalWebSocket() {
  if (!multiplayerState.socket || !multiplayerState.socket.connected) {
    connectToWebSocket();
  }
}

// Synchronizuj awatary przy starcie aplikacji
async function syncAvatarsOnStart() {
  try {
    const response = await fetch('/api/get-all-avatars');
    const data = await response.json();
    
    if (data.success) {
      Object.keys(data.avatars).forEach(username => {
        localStorage.setItem(`monkiguessr-avatar-${username}`, data.avatars[username]);
      });
    }
  } catch (error) {
    console.error('Error syncing avatars:', error);
  }
}

// Dodaj style CSS do animacji (umieść w sekcji <style> lub osobnym pliku CSS)
// PWA Installation Functions
function setupPWAInstallation() {
  // Nasłuchuj event beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('beforeinstallprompt fired');
    e.preventDefault();
    deferredPrompt = e;
    
    // Pokaż przycisk instalacji jeśli nie jest zainstalowana
    if (!isAppInstalled) {
      document.getElementById('install-button').style.display = 'inline-block';
      
      // Pokaż prompt instalacji po 10 sekundach
      setTimeout(() => {
        showInstallPrompt();
      }, 10000);
    }
  });

  // Nasłuchuj czy app został zainstalowany
  window.addEventListener('appinstalled', (evt) => {
    console.log('App zainstalowana!');
    isAppInstalled = true;
    document.getElementById('install-button').style.display = 'none';
    showInstallationNotification("✅ Zainstalowano!", "MońkiGuessr został zainstalowany na twoim urządzeniu!", 'success');
  });

  // Rejestruj Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker zarejestrowany:', registration);
      })
      .catch((error) => {
        console.log('Błąd rejestracji Service Worker:', error);
      });
  }
}

function installApp() {
  if (!deferredPrompt) {
    showInstallationNotification("❌ Nie można zainstalować", "Instalacja nie jest dostępna w tej przeglądarce lub aplikacja jest już zainstalowana", 'error');
    return;
  }

  // Pokaż prompt instalacji
  deferredPrompt.prompt();

  // Poczekaj na wybór użytkownika
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      showInstallationNotification("📱 Instalowanie...", "Aplikacja jest instalowana na twoim urządzeniu", 'success');
    } else {
      showInstallationNotification("❌ Anulowano", "Instalacja została anulowana", 'error');
    }
    deferredPrompt = null;
  });
}

function showInstallPrompt() {
  if (isAppInstalled || !deferredPrompt) return;

  const prompt = document.createElement('div');
  prompt.className = 'install-prompt';
  prompt.innerHTML = `
    <div class="install-prompt-title">📱 Zainstaluj MońkiGuessr!</div>
    <div class="install-prompt-desc">Pobierz grę jako aplikację na swoje urządzenie</div>
    <div class="install-prompt-buttons">
      <button class="install-prompt-btn install-btn-yes" onclick="acceptInstallPrompt()">Zainstaluj</button>
      <button class="install-prompt-btn install-btn-no" onclick="dismissInstallPrompt()">Nie teraz</button>
    </div>
  `;

  document.body.appendChild(prompt);

  setTimeout(() => {
    prompt.classList.add('show');
  }, 100);

  // Auto-dismiss po 15 sekundach
  setTimeout(() => {
    dismissInstallPrompt();
  }, 15000);
}

function acceptInstallPrompt() {
  const prompt = document.querySelector('.install-prompt');
  if (prompt) {
    prompt.remove();
  }
  installApp();
}

function dismissInstallPrompt() {
  const prompt = document.querySelector('.install-prompt');
  if (prompt) {
    prompt.classList.remove('show');
    setTimeout(() => {
      if (prompt.parentNode) {
        prompt.remove();
      }
    }, 500);
  }
}

function showInstallationNotification(title, description, type = 'success') {
  const notificationData = {
    type: type,
    html: `
      <div class="notification-icon">${type === 'success' ? '📱' : '❌'}</div>
      <div class="notification-text">
        <div class="notification-title">${title}</div>
        <div class="notification-desc">${description}</div>
      </div>
    `
  };

  queueNotification(notificationData);
}

// Star pin sticker display logic implemented