// ============================================================
// script.js - ピクたま ゲームロジック
// ============================================================

// ---- 定数 ------------------------------------------------

const SAVE_KEY = 'pikutama_v1';

// ステータス減少レート（1分あたり）- やさしめ設定
const DECAY = {
  hunger:      1 / 6,   // 6分で1減 ≒ 1時間で10減
  mood:        1 / 9,   // 9分で1減 ≒ 1時間で6.7減
  cleanliness: 1 / 12,  // 12分で1減 ≒ 1時間で5減
};

// 睡眠中は減少を緩やかに
const SLEEP_MODIFIER = 0.25;

// 成長に必要な経過時間（分）- 現ステージ開始からの経過
const GROWTH_MINUTES = {
  egg:   1,    // たまご → こども: 1分
  child: 60,   // こども → せいちょうき: 1時間
  young: 180,  // せいちょうき → おとな: 3時間
};

const POOP_INTERVAL = 90; // うんち発生間隔（分）
const MAX_POOP      = 5;

const SICK_STAT_THRESHOLD = 15;  // 病気閾値
const SICK_MINUTES        = 60;  // 低ステータス継続でこの分後に病気

const SNACK_PENALTY_COUNT = 5;   // スナック使いすぎ閾値

const MAX_ELAPSED_MIN = 48 * 60; // オフライン上限（48時間）

// ============================================================
// ---- ピクセルアートシステム
// ============================================================

const PIXEL_SIZE = 6; // 1ドット = 6px

// カラーパレット（インデックス → CSS色）
const PALETTE = [
  null,        // 0: 透明
  '#e8dfc8',   // 1: ボディ（クリーム）
  '#180f00',   // 2: アウトライン（濃い茶黒）
  '#180f00',   // 3: 目（アウトラインと同色）
  '#c8283c',   // 4: 口・赤アクセント
  '#ffb8cc',   // 5: ほっぺ（ピンク）
  '#ffffff',   // 6: ハイライト（白）
  '#a0d870',   // 7: 予備（緑）
];

// スプライト定義: 各行は12文字の文字列（数字 = PALETTEインデックス）
// 12px幅 × 高さ可変、PIXEL_SIZE=6 → 72px幅
const SPRITES = {

  // === たまご (12×13) ===
  egg: [
    '000222222000',
    '002111111200',
    '021166111120',  // 6=ハイライト
    '211111111120',
    '211111111120',
    '211111111120',
    '211111111120',
    '211111111120',
    '211111111120',
    '021111111200',
    '002211112000',
    '000222222000',
    '000000000000',
  ],

  // === こども (12×14) ===
  // 小さくてまるっこいキャラ
  child: [
    '000222222000',
    '002111111200',
    '021131113120',  // 目（位置4,8）
    '211111111120',
    '211511115120',  // ほっぺ（5=ピンク）
    '211144411120',  // 口（4=赤、笑顔）
    '021111111200',
    '000211112000',  // 首
    '002111111200',  // 胴体
    '022111111220',
    '002222222000',
    '002200002200',  // 足
    '002200002200',
    '000000000000',
  ],

  // === せいちょうき（げんき） (12×15) ===
  // 元気に手を上げたポーズ
  young_genki: [
    '000022220000',
    '000211112000',
    '002133113200',  // くっきりした目
    '002151512000',  // ほっぺ
    '002114412000',  // 笑顔
    '000211112000',
    '200211112002',  // 両手を上に（端に2でアーム）
    '220211112022',
    '002111111200',  // 胴体
    '002111111200',
    '002111111200',
    '000211112000',
    '000220022000',  // 脚
    '002200002200',  // 足
    '000000000000',
  ],

  // === せいちょうき（ふつう） (12×14) ===
  young_normal: [
    '000022220000',
    '000211112000',
    '002131312000',  // 普通の目
    '002111112000',
    '002151512000',  // ほっぺ
    '002114412000',  // 口
    '000211112000',
    '002111111200',  // 胴体
    '002111111200',
    '002111111200',
    '000211112000',
    '000220022000',
    '002200002200',
    '000000000000',
  ],

  // === せいちょうき（のんびり） (12×14) ===
  // 目が細い・体が少し丸い
  young_lazy: [
    '000022220000',
    '000211112000',
    '002222212000',  // 半分閉じた目（上が2=アウトライン）
    '002133312000',  // 目の下半分
    '002111112000',
    '002144412000',  // 平坦な口
    '000211112000',
    '002211112200',  // 少し丸い胴体
    '002211112200',
    '002211112200',
    '000221122000',
    '000022002200',
    '000022002200',
    '000000000000',
  ],

  // === おとな（げんき） (12×16) ===
  // 背が高くて元気
  adult_genki: [
    '000022220000',
    '002111111200',
    '021133113120',  // 輝く目
    '211151511120',  // ほっぺ
    '211144411120',  // 大きな笑顔
    '021111111200',
    '221111111220',  // 肩幅広い
    '211111111120',
    '211111111120',
    '211111111120',
    '021111111200',
    '002111111200',
    '000220022000',
    '000220022000',
    '002200002200',
    '000000000000',
  ],

  // === おとな（ふつう） (12×16) ===
  adult_normal: [
    '000022220000',
    '002111111200',
    '021131113120',  // 落ち着いた目
    '211111111120',
    '211144411120',  // 普通の笑顔
    '021111111200',
    '021111111200',
    '021111111200',
    '211111111120',
    '211111111120',
    '021111111200',
    '002111111200',
    '000220022000',
    '000220022000',
    '002200002200',
    '000000000000',
  ],

  // === おとな（のんびり） (12×16) ===
  // 丸くてぽっちゃり、目が細い
  adult_lazy: [
    '000022220000',
    '002211112200',
    '022222222220',  // 細い目
    '222133312220',
    '222111112220',
    '221144411220',  // 平坦な口
    '221111112220',  // 丸い体
    '221111112220',
    '221111112220',
    '221111112220',
    '222111112220',
    '022211122200',
    '000221122000',
    '000022002200',
    '000022002200',
    '000000000000',
  ],
};

/**
 * スプライト名を取得（ステージ・バリアントから決定）
 */
function getSpriteName() {
  const { stage, variant } = state;
  if (stage === 'egg')   return 'egg';
  if (stage === 'child') return 'child';
  if (stage === 'young') return `young_${variant}`;
  if (stage === 'adult') return `adult_${variant}`;
  return 'egg';
}

/**
 * キャラクターの状態クラスを取得（CSS エフェクト用）
 */
function getCharStateClass() {
  const { sleep, health, mood, hunger } = state;
  if (sleep === 'sleeping') return 'char-sleeping';
  if (health === 'sick')    return 'char-sick';
  if (mood < 25 || hunger < 20) return 'char-sad';
  if (mood > 70 && hunger > 50) return 'char-happy';
  return 'char-normal';
}

/**
 * Canvas にスプライトを描画する
 */
function drawSpriteToCanvas(canvasEl, spriteName) {
  const rows = SPRITES[spriteName];
  if (!rows) return;

  const ps   = PIXEL_SIZE;
  const cols = rows[0].length;
  canvasEl.width  = cols * ps;
  canvasEl.height = rows.length * ps;

  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const idx   = parseInt(row[x], 10);
      const color = PALETTE[idx];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * ps, y * ps, ps, ps);
    }
  });
}

// ============================================================
// ---- デフォルト状態
// ============================================================

function createDefaultState() {
  const now = Date.now();
  return {
    stage:            'egg',
    variant:          'normal',
    hunger:      100,
    mood:        100,
    cleanliness: 100,
    health:      'normal',
    sleep:       'awake',
    ageMinutes:        0,
    lastSave:          now,
    bornAt:            now,
    stageStartMinutes: 0,
    poop:          0,
    poopMinutes:   0,
    careCount:     0,
    neglectCount:  0,
    snackCount:    0,
    lowStatMinutes: 0,
    isFirstBoot: true,
  };
}

let state        = createDefaultState();
let tickInterval = null;
let gameRunning  = false; // visibilitychange で使用

// ============================================================
// ---- LocalStorage
// ============================================================

function saveGame() {
  state.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('セーブ失敗:', e);
  }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    state = JSON.parse(raw);
    return true;
  } catch (e) {
    console.error('ロード失敗:', e);
    return false;
  }
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  state = createDefaultState();
}

// ============================================================
// ---- 時間経過処理
// ============================================================

/**
 * lastSave との差分を計算してステータスを更新。
 * 起動時・visibilitychange 復帰時・gameTick 時に呼ぶ。
 */
function applyTimeElapsed() {
  const now        = Date.now();
  const elapsedMs  = now - state.lastSave;
  const elapsedMin = Math.min(elapsedMs / 60000, MAX_ELAPSED_MIN);

  if (elapsedMin < 0.1) return; // 6秒未満は無視

  // たまご期はステータス変化なし（年齢だけ加算）
  if (state.stage === 'egg') {
    state.ageMinutes += elapsedMin;
    return;
  }

  const mod = state.sleep === 'sleeping' ? SLEEP_MODIFIER : 1.0;

  state.hunger      = clamp(state.hunger      - DECAY.hunger      * elapsedMin * mod, 0, 100);
  state.mood        = clamp(state.mood        - DECAY.mood        * elapsedMin * mod, 0, 100);
  state.cleanliness = clamp(state.cleanliness - DECAY.cleanliness * elapsedMin,       0, 100);
  state.ageMinutes += elapsedMin;

  // うんち（睡眠中は発生しない）
  if (state.sleep !== 'sleeping') {
    state.poopMinutes = (state.poopMinutes || 0) + elapsedMin;
    const newPoops    = Math.floor(state.poopMinutes / POOP_INTERVAL);
    if (newPoops > 0) {
      state.poop        = Math.min(MAX_POOP, state.poop + newPoops);
      state.poopMinutes = state.poopMinutes % POOP_INTERVAL;
    }
  }

  // うんちが多いと清潔度が落ちる
  if (state.poop >= 3) {
    state.cleanliness = clamp(state.cleanliness - state.poop * 1.5, 0, 100);
  }

  // 低ステータス継続（病気判定）
  const isLow = state.hunger < SICK_STAT_THRESHOLD || state.cleanliness < SICK_STAT_THRESHOLD;
  if (isLow) {
    state.lowStatMinutes  = (state.lowStatMinutes  || 0) + elapsedMin;
    state.neglectCount   += Math.floor(elapsedMin / 30);
  } else {
    state.lowStatMinutes = Math.max(0, (state.lowStatMinutes || 0) - elapsedMin * 0.5);
  }

  if (state.lowStatMinutes >= SICK_MINUTES && state.health === 'normal') {
    state.health = 'sick';
    showMessage('⚠️ 具合が悪そう…なおしてあげて！');
  }

  // 夜更かしペナルティ
  const hour = new Date().getHours();
  if ((hour >= 22 || hour < 6) && state.sleep === 'awake') {
    state.mood = clamp(state.mood - elapsedMin * 0.1, 0, 100);
  }
}

// ============================================================
// ---- ゲームループ（10秒ごと）
// ============================================================

function startGameLoop() {
  if (tickInterval) clearInterval(tickInterval);
  // 10秒ごとにtick（60秒から短縮でよりレスポンシブに）
  tickInterval = setInterval(gameTick, 10 * 1000);
}

function gameTick() {
  applyTimeElapsed();
  checkGrowth();
  checkNightHint();
  updateDisplay();
  saveGame();
}

function checkNightHint() {
  const hour = new Date().getHours();
  if (hour >= 22 && state.sleep === 'awake' && state.stage !== 'egg') {
    if (Math.random() < 0.1) { // 10秒ごとなので確率を下げる
      showMessage('🌙 夜だよ〜そろそろ寝よう？');
    }
  }
}

// ============================================================
// ---- 成長チェック
// ============================================================

function checkGrowth() {
  if (state.stage === 'adult') return;

  const stageElapsed = state.ageMinutes - state.stageStartMinutes;
  const threshold    = GROWTH_MINUTES[state.stage];

  if (stageElapsed >= threshold) {
    if (state.stage === 'young') determineVariant();
    const nextStage = { egg: 'child', child: 'young', young: 'adult' }[state.stage];
    evolveToStage(nextStage);
  }
}

function determineVariant() {
  const total    = state.careCount + state.neglectCount;
  const careRate = total > 0 ? state.careCount / total : 0.5;

  if (careRate >= 0.65)      state.variant = 'genki';
  else if (careRate >= 0.35) state.variant = 'normal';
  else                       state.variant = 'lazy';
}

// ============================================================
// ---- 成長演出
// ============================================================

function evolveToStage(newStage) {
  state.stage             = newStage;
  state.stageStartMinutes = state.ageMinutes;

  const stageNames = { child: 'こども', young: 'せいちょうき', adult: 'おとな' };
  const variantLabels = {
    genki:  'げんき系キャラ ⭐',
    normal: 'ふつう系キャラ 😊',
    lazy:   'のんびり系キャラ 😴',
  };

  // モーダルのスプライトを描画
  const evoCanvas = document.getElementById('evo-canvas');
  drawSpriteToCanvas(evoCanvas, getSpriteName());
  evoCanvas.className = 'evo-sprite-canvas';

  document.getElementById('evo-title').textContent =
    `🎉 ${stageNames[newStage]} に せいちょう！`;
  document.getElementById('evo-message').textContent =
    newStage === 'adult'
      ? `${variantLabels[state.variant]} に なったよ！\nいっぱい あそんでね！`
      : 'すくすく そだっているよ！\nこれからも よろしくね！';

  showModal('modal-evo');
  showMessage(`✨ ${stageNames[newStage]} に せいちょうした！`);
}

// ============================================================
// ---- お世話操作
// ============================================================

function doAction(type) {
  if (state.stage === 'egg' && type !== 'sleep') {
    showMessage('まだたまごだよ〜もうすぐ孵化するよ！');
    return;
  }
  if (state.sleep === 'sleeping' && type !== 'sleep' && type !== 'heal') {
    showMessage('おねむ中だよ。先に起こしてあげてね！');
    return;
  }

  switch (type) {
    case 'feed':
      if (state.hunger >= 95) { showMessage('お腹いっぱいだよ〜！'); return; }
      state.hunger = clamp(state.hunger + 20, 0, 100);
      state.careCount++;
      showMessage('🍙 もぐもぐ…おいしい！');
      break;

    case 'snack':
      state.snackCount++;
      if (state.snackCount > SNACK_PENALTY_COUNT) {
        state.mood   = clamp(state.mood + 8,   0, 100);
        state.hunger = clamp(state.hunger + 20, 0, 100);
        showMessage('🍬 おやつ食べすぎかも…お腹が苦しいよ');
      } else {
        state.mood = clamp(state.mood + 15, 0, 100);
        showMessage('🍬 やったー！おやつだ！うれしい！');
      }
      state.careCount++;
      break;

    case 'play':
      if (state.hunger < 15) { showMessage('お腹が空いて遊べないよ〜ごはんが先！'); return; }
      state.mood   = clamp(state.mood   + 20, 0, 100);
      state.hunger = clamp(state.hunger -  5, 0, 100);
      state.careCount++;
      showMessage('🎮 わーい！たのしいね！');
      break;

    case 'clean':
      state.cleanliness = clamp(state.cleanliness + 40, 0, 100);
      if (state.poop > 0) {
        state.poop = 0;
        state.poopMinutes = 0;
        showMessage('🚿 きれいになったよ！うんちも片付けたよ！');
      } else {
        showMessage('🚿 ぴかぴかになったよ！');
      }
      state.careCount++;
      break;

    case 'heal':
      if (state.health !== 'sick') { showMessage('元気だから薬はいらないよ！'); return; }
      state.health        = 'normal';
      state.lowStatMinutes = 0;
      state.careCount++;
      showMessage('💊 元気になったよ！ありがとう！');
      break;

    case 'sleep':
      if (state.sleep === 'awake') {
        state.sleep = 'sleeping';
        showMessage('🌙 おやすみ…zzz');
        setSleepButtonText('sleeping');
      } else {
        state.sleep = 'awake';
        state.mood  = clamp(state.mood + 10, 0, 100);
        showMessage('☀️ おはよう！よく眠れたよ！');
        setSleepButtonText('awake');
      }
      state.careCount++;
      break;
  }

  updateDisplay();
  saveGame();
}

function setSleepButtonText(sleepState) {
  const btn = document.getElementById('btn-sleep-wake');
  if (sleepState === 'sleeping') {
    btn.querySelector('.btn-emoji').textContent = '☀️';
    btn.querySelector('.btn-label').textContent = 'おこす';
  } else {
    btn.querySelector('.btn-emoji').textContent = '🌙';
    btn.querySelector('.btn-label').textContent = 'ねる';
  }
}

// ============================================================
// ---- 表示更新
// ============================================================

function updateDisplay() {
  updateChar();
  updateBars();
  updateHeader();
  updateIcons();
}

/** メインキャラクターを描画 */
function updateChar() {
  const canvas = document.getElementById('char-canvas');
  drawSpriteToCanvas(canvas, getSpriteName());
  canvas.className = 'char-canvas ' + getCharStateClass();

  // ZZZオーバーレイ（睡眠中）
  const zzz = document.getElementById('zzz-overlay');
  zzz.textContent = state.sleep === 'sleeping' ? 'z z z' : '';
  zzz.style.display = state.sleep === 'sleeping' ? 'block' : 'none';

  // うんち表示
  document.getElementById('poop-display').textContent = '💩'.repeat(state.poop);
}

function updateBars() {
  setBar('bar-hunger', 'num-hunger', state.hunger);
  setBar('bar-mood',   'num-mood',   state.mood);
  setBar('bar-clean',  'num-clean',  state.cleanliness);
}

function setBar(barId, numId, value) {
  const bar = document.getElementById(barId);
  const num = document.getElementById(numId);
  const v   = Math.max(0, Math.min(100, Math.round(value)));
  bar.style.width = v + '%';
  num.textContent = v;
  bar.classList.remove('danger', 'warn');
  if (v < 20)      bar.classList.add('danger');
  else if (v < 40) bar.classList.add('warn');
}

function updateHeader() {
  const stageNames = { egg: 'たまご', child: 'こども', young: 'せいちょうき', adult: 'おとな' };
  document.getElementById('hdr-stage').textContent = stageNames[state.stage] || state.stage;
  const totalMin = Math.floor(state.ageMinutes);
  const days     = Math.floor(totalMin / (60 * 24));
  const hours    = Math.floor((totalMin % (60 * 24)) / 60);
  document.getElementById('hdr-age').textContent = `${days}日${hours}時間`;
}

function updateIcons() {
  document.getElementById('icon-sick').textContent =
    state.health === 'sick' ? '🤒 びょうき' : '';
  document.getElementById('icon-sleep').textContent =
    state.sleep === 'sleeping' ? '💤 おやすみ' : '';
  document.getElementById('icon-poop-count').textContent =
    state.poop > 0 ? `💩×${state.poop}` : '';
}

// ============================================================
// ---- メッセージ
// ============================================================

function showMessage(text) {
  const el = document.getElementById('msg-text');
  el.textContent = text;
  el.classList.remove('msg-flash');
  void el.offsetWidth;
  el.classList.add('msg-flash');
}

// ============================================================
// ---- モーダル
// ============================================================

function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ============================================================
// ---- 育成記録
// ============================================================

function showResult() {
  const stageNames   = { egg: 'たまご', child: 'こども', young: 'せいちょうき', adult: 'おとな' };
  const variantNames = { genki: 'げんき系 ⭐', normal: 'ふつう系 😊', lazy: 'のんびり系 😴' };
  const totalMin     = Math.floor(state.ageMinutes);
  const days         = Math.floor(totalMin / (60 * 24));
  const hours        = Math.floor((totalMin % (60 * 24)) / 60);
  const total        = state.careCount + state.neglectCount;
  const careRate     = total > 0 ? state.careCount / total : 0.5;
  const evaluation   = careRate >= 0.7 ? '🌟 すばらしい！' : careRate >= 0.4 ? '😊 まあまあ！' : '😅 もっとお世話してね！';

  const variantRow = state.stage === 'adult'
    ? `<div class="result-item"><span>タイプ</span><span>${variantNames[state.variant] || ''}</span></div>`
    : '';

  // 結果モーダルにスプライトを描画
  const resultBody = document.getElementById('result-body');
  resultBody.innerHTML = `
    <canvas id="result-canvas" class="result-char-canvas"></canvas>
    <div class="result-item"><span>せいちょうだんかい</span><span>${stageNames[state.stage]}</span></div>
    ${variantRow}
    <div class="result-item"><span>ねんれい</span><span>${days}日 ${hours}時間</span></div>
    <div class="result-item"><span>おせわ かいすう</span><span>${state.careCount}かい</span></div>
    <div class="result-item"><span>ほうち かいすう</span><span>${state.neglectCount}かい</span></div>
    <div class="result-item"><span>ひょうか</span><span>${evaluation}</span></div>
  `;
  // innerHTML 後に canvas を取得して描画
  const resultCanvas = document.getElementById('result-canvas');
  drawSpriteToCanvas(resultCanvas, getSpriteName());

  showModal('modal-result');
}

// ============================================================
// ---- 画面切り替え
// ============================================================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ============================================================
// ---- メインゲーム開始
// ============================================================

function startMainGame() {
  showScreen('screen-main');
  setSleepButtonText(state.sleep);
  checkGrowth();
  updateDisplay();
  startGameLoop();
  gameRunning = true;

  if (state.isFirstBoot) {
    state.isFirstBoot = false;
    showMessage('🥚 たまごが生まれたよ！大切に育ててね！');
  } else {
    showMessage('おかえり！ずっと待ってたよ！');
  }
  saveGame();
}

// ============================================================
// ---- 初期化
// ============================================================

function init() {
  const hasSave = localStorage.getItem(SAVE_KEY) !== null;

  document.getElementById('btn-new').addEventListener('click', () => {
    resetGame();
    startMainGame();
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    if (loadGame()) {
      applyTimeElapsed();
      startMainGame();
    } else {
      alert('セーブデータがありません。「はじめる」を選んでください。');
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('リセットしますか？データが消えますよ？')) {
      resetGame();
      location.reload();
    }
  });

  if (!hasSave) {
    document.getElementById('btn-load').disabled = true;
  }

  // ★ iOSバックグラウンド対策: 画面復帰時に即時時間経過を適用
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && gameRunning) {
      applyTimeElapsed();
      checkGrowth();
      updateDisplay();
      saveGame();
    }
  });

  showScreen('screen-title');
}

// ============================================================
// ---- ユーティリティ
// ============================================================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// ---- エントリーポイント
// ============================================================

window.addEventListener('DOMContentLoaded', init);
