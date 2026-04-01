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
  egg:   5,    // たまご → こども: 5分
  child: 120,  // こども → せいちょうき: 2時間
  young: 360,  // せいちょうき → おとな: 6時間（合計8時間）
};

// うんち
const POOP_INTERVAL = 90; // 90分ごとに1個
const MAX_POOP      = 5;

// 病気になる条件
const SICK_STAT_THRESHOLD = 15;  // このステータス以下が続くと…
const SICK_MINUTES        = 60;  // 60分続くと病気

// スナックのペナルティ閾値
const SNACK_PENALTY_COUNT = 5;

// オフライン経過の上限（48時間）
const MAX_ELAPSED_MIN = 48 * 60;

// ---- デフォルト状態 ----------------------------------------

function createDefaultState() {
  const now = Date.now();
  return {
    // 成長
    stage:            'egg',    // egg / child / young / adult
    variant:          'normal', // genki / normal / lazy （大人で確定）

    // ステータス
    hunger:      100,
    mood:        100,
    cleanliness: 100,
    health:      'normal',  // normal / sick
    sleep:       'awake',   // awake / sleeping

    // 時間管理
    ageMinutes:        0,
    lastSave:          now,
    bornAt:            now,
    stageStartMinutes: 0,   // 現ステージになった時点での ageMinutes

    // カウンター
    poop:          0,
    poopMinutes:   0,   // 前回うんちからの経過分
    careCount:     0,   // お世話した回数
    neglectCount:  0,   // 放置カウント
    snackCount:    0,   // スナック使用回数
    lowStatMinutes: 0,  // 低ステータス継続時間（病気判定用）

    // 初回フラグ
    isFirstBoot: true,
  };
}

// ---- 状態変数 -----------------------------------------------

let state = createDefaultState();
let tickInterval = null; // setInterval の ID

// ---- LocalStorage ------------------------------------------

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

// ---- 時間経過処理 -------------------------------------------

/**
 * lastSave から現在までの差分（分）を計算し、
 * ステータスを更新する。アプリ復帰時に呼ぶ。
 */
function applyTimeElapsed() {
  const now        = Date.now();
  const elapsedMs  = now - state.lastSave;
  const elapsedMin = Math.min(elapsedMs / 60000, MAX_ELAPSED_MIN);

  if (elapsedMin < 0.5) return; // 30秒未満は無視

  // たまご期はステータス変化なし
  if (state.stage === 'egg') {
    state.ageMinutes += elapsedMin;
    return;
  }

  // 睡眠中は減少を緩和
  const mod = state.sleep === 'sleeping' ? SLEEP_MODIFIER : 1.0;

  // ステータス減少
  state.hunger      = clamp(state.hunger      - DECAY.hunger      * elapsedMin * mod, 0, 100);
  state.mood        = clamp(state.mood        - DECAY.mood        * elapsedMin * mod, 0, 100);
  state.cleanliness = clamp(state.cleanliness - DECAY.cleanliness * elapsedMin,       0, 100);

  // 年齢加算
  state.ageMinutes += elapsedMin;

  // うんち（睡眠中は発生しない）
  if (state.sleep !== 'sleeping') {
    state.poopMinutes = (state.poopMinutes || 0) + elapsedMin;
    const newPoops = Math.floor(state.poopMinutes / POOP_INTERVAL);
    if (newPoops > 0) {
      state.poop      = Math.min(MAX_POOP, state.poop + newPoops);
      state.poopMinutes = state.poopMinutes % POOP_INTERVAL;
    }
  }

  // うんちが多いと清潔度が落ちる
  if (state.poop >= 3) {
    state.cleanliness = clamp(state.cleanliness - state.poop * 1.5, 0, 100);
  }

  // 低ステータス継続時間（病気判定）
  const isLow = state.hunger < SICK_STAT_THRESHOLD || state.cleanliness < SICK_STAT_THRESHOLD;
  if (isLow) {
    state.lowStatMinutes = (state.lowStatMinutes || 0) + elapsedMin;
    state.neglectCount  += Math.floor(elapsedMin / 30);
  } else {
    // 状態が良ければ低ステータス時間を回復
    state.lowStatMinutes = Math.max(0, (state.lowStatMinutes || 0) - elapsedMin * 0.5);
  }

  // 病気チェック
  if (state.lowStatMinutes >= SICK_MINUTES && state.health === 'normal') {
    state.health = 'sick';
    showMessage('⚠️ 具合が悪そう…なおしてあげて！');
  }

  // 夜更かしペナルティ（22時〜6時に起きていると機嫌が落ちやすい）
  const hour = new Date().getHours();
  if ((hour >= 22 || hour < 6) && state.sleep === 'awake') {
    state.mood = clamp(state.mood - elapsedMin * 0.1, 0, 100);
  }
}

// ---- ゲームループ（60秒ごと） --------------------------------

function startGameLoop() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(gameTick, 60 * 1000);
}

function gameTick() {
  applyTimeElapsed();
  checkGrowth();
  checkNightHint();
  updateDisplay();
  saveGame();
}

// 夜間のヒントメッセージ
function checkNightHint() {
  const hour = new Date().getHours();
  if (hour >= 22 && state.sleep === 'awake' && state.stage !== 'egg') {
    if (Math.random() < 0.4) {
      showMessage('🌙 夜だよ〜そろそろ寝よう？');
    }
  }
}

// ---- 成長チェック -------------------------------------------

function checkGrowth() {
  if (state.stage === 'adult') return;

  const stageElapsed = state.ageMinutes - state.stageStartMinutes;
  const threshold    = GROWTH_MINUTES[state.stage];

  if (stageElapsed >= threshold) {
    if (state.stage === 'young') {
      determineVariant(); // 大人になる前にバリアント確定
    }
    const nextStage = { egg: 'child', child: 'young', young: 'adult' }[state.stage];
    evolveToStage(nextStage);
  }
}

// ---- バリアント決定（大人の種類） ---------------------------

function determineVariant() {
  const total    = state.careCount + state.neglectCount;
  const careRate = total > 0 ? state.careCount / total : 0.5;

  if (careRate >= 0.65) {
    state.variant = 'genki';
  } else if (careRate >= 0.35) {
    state.variant = 'normal';
  } else {
    state.variant = 'lazy';
  }
}

// ---- 成長演出 -----------------------------------------------

function evolveToStage(newStage) {
  state.stage            = newStage;
  state.stageStartMinutes = state.ageMinutes;

  const stageNames = { child: 'こども', young: 'せいちょうき', adult: 'おとな' };
  const variantLabels = {
    genki:  'げんき系キャラ ⭐',
    normal: 'ふつう系キャラ 😊',
    lazy:   'のんびり系キャラ 😴',
  };

  // モーダルを設定
  document.getElementById('evo-sprite').textContent  = getCharEmoji();
  document.getElementById('evo-title').textContent   = `🎉 ${stageNames[newStage]} に せいちょう！`;
  document.getElementById('evo-message').textContent =
    newStage === 'adult'
      ? `${variantLabels[state.variant]} に なったよ！\nいっぱい あそんでね！`
      : 'すくすく そだっているよ！\nこれからも よろしくね！';

  showModal('modal-evo');
  showMessage(`✨ ${stageNames[newStage]} に せいちょうした！`);
}

// ---- キャラクター絵文字 -------------------------------------

function getCharEmoji() {
  const { stage, variant, health, sleep, mood, hunger } = state;

  if (sleep === 'sleeping') return '😴';
  if (health === 'sick')    return '🤒';

  const happy = mood > 70 && hunger > 50;
  const sad   = mood < 25 || hunger < 20;

  switch (stage) {
    case 'egg':
      return '🥚';

    case 'child':
      return sad ? '😢' : happy ? '🐣' : '🐤';

    case 'young':
      if (variant === 'genki')  return sad ? '😟' : happy ? '🐥' : '🐤';
      if (variant === 'lazy')   return sad ? '😞' : '🐤';
      return sad ? '😟' : '🐤';

    case 'adult':
      if (variant === 'genki')  return sad ? '😤' : happy ? '🐓' : '🐔';
      if (variant === 'lazy')   return sad ? '😪' : '🦥';
      return sad ? '🙁' : happy ? '🦆' : '🦆';

    default:
      return '❓';
  }
}

// キャラクターのアニメーションクラスを返す
function getCharClass() {
  const { sleep, health, mood, hunger } = state;
  if (sleep === 'sleeping') return 'char-sleeping';
  if (health === 'sick')    return 'char-sick';
  if (mood < 25 || hunger < 20) return 'char-sad';
  if (mood > 70 && hunger > 50) return 'char-happy';
  return 'char-normal';
}

// ---- お世話操作 ---------------------------------------------

/**
 * ボタン押下時のアクションハンドラ。
 * HTML の onclick="doAction('xxx')" から呼ばれる。
 */
function doAction(type) {
  // たまご期は睡眠操作のみ
  if (state.stage === 'egg' && type !== 'sleep') {
    showMessage('まだたまごだよ〜もうすぐ孵化するよ！');
    return;
  }

  // 睡眠中は起こすか治療以外不可
  if (state.sleep === 'sleeping' && type !== 'sleep' && type !== 'heal') {
    showMessage('おねむ中だよ。先に起こしてあげてね！');
    return;
  }

  switch (type) {
    // ごはん
    case 'feed':
      if (state.hunger >= 95) {
        showMessage('お腹いっぱいだよ〜！');
        return;
      }
      state.hunger = clamp(state.hunger + 20, 0, 100);
      state.careCount++;
      showMessage('🍙 もぐもぐ…おいしい！');
      break;

    // おやつ（使いすぎるとペナルティ）
    case 'snack':
      state.snackCount++;
      if (state.snackCount > SNACK_PENALTY_COUNT) {
        state.mood   = clamp(state.mood + 8, 0, 100);
        state.hunger = clamp(state.hunger + 20, 0, 100); // 太りすぎ
        showMessage('🍬 おやつ食べすぎかも…お腹が苦しいよ');
      } else {
        state.mood = clamp(state.mood + 15, 0, 100);
        showMessage('🍬 やったー！おやつだ！うれしい！');
      }
      state.careCount++;
      break;

    // あそぶ
    case 'play':
      if (state.hunger < 15) {
        showMessage('お腹が空いて遊べないよ〜ごはんが先！');
        return;
      }
      state.mood   = clamp(state.mood   + 20, 0, 100);
      state.hunger = clamp(state.hunger -  5, 0, 100);
      state.careCount++;
      showMessage('🎮 わーい！たのしいね！');
      break;

    // そうじ
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

    // なおす
    case 'heal':
      if (state.health !== 'sick') {
        showMessage('元気だから薬はいらないよ！');
        return;
      }
      state.health       = 'normal';
      state.lowStatMinutes = 0;
      state.careCount++;
      showMessage('💊 元気になったよ！ありがとう！');
      break;

    // ねる / おこす
    case 'sleep':
      if (state.sleep === 'awake') {
        state.sleep = 'sleeping';
        showMessage('🌙 おやすみ…zzz');
        setSleepButtonText('sleeping');
      } else {
        state.sleep = 'awake';
        state.mood  = clamp(state.mood + 10, 0, 100); // 睡眠で機嫌回復
        showMessage('☀️ おはよう！よく眠れたよ！');
        setSleepButtonText('awake');
      }
      state.careCount++;
      break;
  }

  updateDisplay();
  saveGame();
}

// 睡眠ボタンのテキストを切り替え
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

// ---- 表示更新 -----------------------------------------------

function updateDisplay() {
  updateChar();
  updateBars();
  updateHeader();
  updateIcons();
}

// キャラクタースプライト更新
function updateChar() {
  const sprite = document.getElementById('char-sprite');
  sprite.textContent = getCharEmoji();
  sprite.className   = 'char-sprite ' + getCharClass();

  // うんち表示
  document.getElementById('poop-display').textContent = '💩'.repeat(state.poop);
}

// ステータスバー更新
function updateBars() {
  setBar('bar-hunger', 'num-hunger', state.hunger);
  setBar('bar-mood',   'num-mood',   state.mood);
  setBar('bar-clean',  'num-clean',  state.cleanliness);
}

// バー1本を更新（値に応じて色も変える）
function setBar(barId, numId, value) {
  const bar = document.getElementById(barId);
  const num = document.getElementById(numId);
  const v   = Math.max(0, Math.min(100, Math.round(value)));

  bar.style.width = v + '%';
  num.textContent = v;

  // 危険・警告色
  bar.classList.remove('danger', 'warn');
  if (v < 20) {
    bar.classList.add('danger');
  } else if (v < 40) {
    bar.classList.add('warn');
  }
}

// ヘッダー（成長段階・年齢）更新
function updateHeader() {
  const stageNames = {
    egg:   'たまご',
    child: 'こども',
    young: 'せいちょうき',
    adult: 'おとな',
  };

  document.getElementById('hdr-stage').textContent = stageNames[state.stage] || state.stage;

  const totalMin = Math.floor(state.ageMinutes);
  const days     = Math.floor(totalMin / (60 * 24));
  const hours    = Math.floor((totalMin % (60 * 24)) / 60);
  document.getElementById('hdr-age').textContent = `${days}日${hours}時間`;
}

// 状態アイコン（病気・睡眠・うんち）更新
function updateIcons() {
  document.getElementById('icon-sick').textContent =
    state.health === 'sick' ? '🤒 びょうき' : '';

  document.getElementById('icon-sleep').textContent =
    state.sleep === 'sleeping' ? '💤 おやすみ' : '';

  document.getElementById('icon-poop-count').textContent =
    state.poop > 0 ? `💩×${state.poop}` : '';
}

// ---- メッセージ表示 -----------------------------------------

function showMessage(text) {
  const el = document.getElementById('msg-text');
  el.textContent = text;
  el.classList.remove('msg-flash');
  // アニメーション再トリガー
  void el.offsetWidth;
  el.classList.add('msg-flash');
}

// ---- モーダル操作 -------------------------------------------

// HTML の onclick="showModal(...)" / onclick="closeModal(...)" から呼ばれる
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ---- 育成記録の表示 -----------------------------------------

function showResult() {
  const stageNames = {
    egg: 'たまご', child: 'こども', young: 'せいちょうき', adult: 'おとな',
  };
  const variantNames = {
    genki: 'げんき系 ⭐', normal: 'ふつう系 😊', lazy: 'のんびり系 😴',
  };

  const totalMin = Math.floor(state.ageMinutes);
  const days     = Math.floor(totalMin / (60 * 24));
  const hours    = Math.floor((totalMin % (60 * 24)) / 60);

  const total    = state.careCount + state.neglectCount;
  const careRate = total > 0 ? state.careCount / total : 0.5;
  let evaluation;
  if (careRate >= 0.7)       evaluation = '🌟 すばらしい！';
  else if (careRate >= 0.4)  evaluation = '😊 まあまあ！';
  else                       evaluation = '😅 もっとお世話してね！';

  let variantRow = '';
  if (state.stage === 'adult') {
    variantRow = `<div class="result-item">
      <span>タイプ</span>
      <span>${variantNames[state.variant] || state.variant}</span>
    </div>`;
  }

  document.getElementById('result-body').innerHTML = `
    <div class="result-char">${getCharEmoji()}</div>
    <div class="result-item"><span>せいちょうだんかい</span><span>${stageNames[state.stage]}</span></div>
    ${variantRow}
    <div class="result-item"><span>ねんれい</span><span>${days}日 ${hours}時間</span></div>
    <div class="result-item"><span>おせわ かいすう</span><span>${state.careCount}かい</span></div>
    <div class="result-item"><span>ほうち かいすう</span><span>${state.neglectCount}かい</span></div>
    <div class="result-item"><span>ひょうか</span><span>${evaluation}</span></div>
  `;

  showModal('modal-result');
}

// ---- 画面切り替え -------------------------------------------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ---- メインゲーム開始 ----------------------------------------

function startMainGame() {
  showScreen('screen-main');

  // 睡眠ボタンの初期テキストを合わせる
  setSleepButtonText(state.sleep);

  // 成長チェック（オフライン中に条件を超えていた場合）
  checkGrowth();

  // 表示を最新状態に
  updateDisplay();

  // ゲームループ開始
  startGameLoop();

  // 初回 or 復帰メッセージ
  if (state.isFirstBoot) {
    state.isFirstBoot = false;
    showMessage('🥚 たまごが生まれたよ！大切に育ててね！');
  } else {
    showMessage('おかえり！ずっと待ってたよ！');
  }

  saveGame();
}

// ---- 初期化 -------------------------------------------------

function init() {
  const hasSave = localStorage.getItem(SAVE_KEY) !== null;

  // 「はじめる」ボタン
  document.getElementById('btn-new').addEventListener('click', () => {
    resetGame();
    startMainGame();
  });

  // 「つづきから」ボタン
  document.getElementById('btn-load').addEventListener('click', () => {
    if (loadGame()) {
      applyTimeElapsed(); // オフライン経過を反映
      startMainGame();
    } else {
      alert('セーブデータがありません。「はじめる」を選んでください。');
    }
  });

  // 「リセット」ボタン
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('リセットしますか？データが消えますよ？')) {
      resetGame();
      // ページリロードでタイトルに戻る
      location.reload();
    }
  });

  // セーブがない場合は「つづきから」を無効化
  if (!hasSave) {
    const loadBtn = document.getElementById('btn-load');
    loadBtn.disabled = true;
  }

  // タイトル画面を表示
  showScreen('screen-title');
}

// ---- ユーティリティ -----------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---- エントリーポイント ------------------------------------

window.addEventListener('DOMContentLoaded', init);
