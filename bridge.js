// Page side of the web Toybox. Without a save, what the app asks its Python core (the start state, each map's
// model, the encyclopedia) is the same for everyone: it was made once when the site was built (web/build_web.sh)
// and is just fetched here. Only when the player imports their save is the Python core (worker.js) started.
(function () {
  // The game canvas takes every key, so the browser never saw F5 / Ctrl+R / Ctrl+Shift+R: reload here first.
  window.addEventListener('keydown', (e) => {
    const r = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'r' || e.key === 'R');
    if (r || e.key === 'F5') { e.preventDefault(); e.stopImmediatePropagation(); location.reload(); }
  }, true);
  // Ctrl+V: Godot pastes what it last heard from the browser, and only hears the new clipboard on the paste
  // after, so every paste came out one behind (a #code took two tries). Hold the key back from the game, let the
  // browser paste (that hands Godot the new clipboard), then press Ctrl+V in the app.
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'v' || e.key === 'V') && !typing(e.target)) e.stopImmediatePropagation();
  }, true);
  window.addEventListener('paste', (e) => {
    if (!typing(e.target)) setTimeout(() => { if (window.toyboxOnPaste) window.toyboxOnPaste(); }, 0);
  });
  // The map's zoom: Godot's web build only hears that the wheel turned, not by how much, so a trackpad (dozens of
  // tiny steps per swipe) zoomed as hard as a mouse wheel clicked dozens of times. Keep how far it really turned
  // (a mouse wheel notch is about 100) for the app to ask: window.toyboxWheelTake() -> distance since last asked.
  let wheelDy = 0, wheelAt = 0;
  window.addEventListener('wheel', (e) => {
    const now = performance.now(); if (now - wheelAt > 150) wheelDy = 0; wheelAt = now;     // a new swipe starts from 0
    wheelDy += Math.abs(e.deltaY) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1); }, { capture: true, passive: true });
  window.toyboxWheelTake = () => { const v = wheelDy; wheelDy = 0; return v; };
  const base = new URL('./', document.baseURI).href;
  const get = (p) => fetch(base + p).then((r) => (r.ok ? r.text() : Promise.reject(new Error(p + ' ' + r.status))));
  let worker = null, next = 1;
  const waiting = new Map();
  function core() {
    if (!worker) {
      worker = new Worker(new URL('worker.js?v=1793882844', document.baseURI), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if ('stage' in data) { window.toyboxStage = data.stage; return; }   // the core starting up: the app shows it
        const cb = waiting.get(data.id); if (cb) { waiting.delete(data.id); cb(data.out || ''); }
      };
    }
    return worker;
  }
  function send(msg, cb, transfer) {
    const id = next++;
    waiting.set(id, cb);
    core().postMessage(Object.assign({ id }, msg), transfer || []);
  }
  // a core command: argv / env as JSON text, cb(output text, like the core prints it)
  window.toyboxRun = (argvJson, envJson, cb) => {
    const argv = JSON.parse(argvJson);
    const done = (p) => p.then((t) => cb(t.trim())).catch((e) => cb(JSON.stringify({ error: String(e.message || e) })));
    const lang = (JSON.parse(envJson || '{}').WOTH2_LANG || '').replace(/[^A-Za-z_]/g, '');
    // the made-once files come in each language the app speaks (data/<name>_<lang>.json); English when there is none
    const data = (name) => lang ? get('data/' + name + '_' + lang + '.json').catch(() => get('data/' + name + '.json')) : get('data/' + name + '.json');
    if (argv[0] === 'encyclopedia') return done(data('encyclopedia'));   // the same for everyone, save or not
    if (argv.includes('--save')) return send({ op: 'run', argv: argvJson, env: envJson }, cb);   // the player's save: Python
    switch (argv[0]) {
      case 'state': return done(data('state'));
      case 'encyclopedia': return done(data('encyclopedia'));
      case 'stats': return done(data('stats'));            // no save: the challenge / mission list to tick off
      case 'prepare': return cb(JSON.stringify({ dir: '/mappack/' + argv[1], icons: '/mappack/icons', missing: [], warnings: [] }));
      default: return cb(JSON.stringify({ error: 'Not in the web app.' }));
    }
  };
  // a file the core wrote (model.json, fow.png), as base64 ('' when missing)
  window.toyboxRead = (path, cb) => send({ op: 'read', path }, cb);
  // Browsers only open a file picker straight from a real click on the page, and the app's own buttons are drawn
  // inside the game engine - so a small page dialog with a real button asks for the file.
  // the page's own dialogs in the app's language (the app sets window.toyboxLang: Settings > Language)
  // every language's lines: filled in by build_web.sh from i18n/web_<lang>.json ({English: translation}; tools/i18n_jobs.py)
  const TEXT = {"de": {"Cancel": "Abbrechen", "Choose file…": "Datei wählen…", "Copied": "Kopiert", "Read your save again": "Spielstand neu lesen", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "Der Browser fragt einmal pro Besuch, bevor die Toybox <b>SaveData.nrgs</b> wieder lesen darf.", "Read it": "Lesen", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Wähle <b>SaveData.nrgs</b>. Unter Windows liegt sie in {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Klicke auf ORDNER KOPIEREN, füge ihn in die Adressleiste des Dateifensters ein und öffne den Account-Ordner.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Er bleibt in diesem Browser. Nach weiteren Jagden importierst du ihn einfach neu, um die neuen Jagden zu sehen.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Mit dem Import deines Spielstands teilst du deine Abschussdaten</b> (Art, Alter, Fitness, Gewicht, Trophäenmaße) und eine Kopie deines Spielstands ohne deinen Jägernamen, damit die Trophäenpunkte besser werden. Kein Name, kein Konto, keine Steam-ID. Du kannst das jederzeit in den Einstellungen ausschalten.", "The first time, reading it downloads about 36 MB.": "Beim ersten Mal lädt das Lesen etwa 36 MB herunter.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>Auf Handy oder Tablet kann der Speicher ausgehen und die Seite schließen.</b> Ein Browser am PC klappt am besten.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Browser können keine Dateien auf deinem PC öffnen, ohne dass du sie auswählst. Soll er sich von selbst laden? Die Toybox-App für den PC findet deinen Spielstand und liest ihn jedes Mal neu, wenn das Spiel speichert.", "Import your save": "Spielstand importieren", "COPY FOLDER": "ORDNER KOPIEREN", "Import your Toybox data": "Deine Toybox-Daten importieren", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Wähle eine Datei, die du aus der Toybox exportiert hast (.json). Sie wird zu dem hinzugefügt, was du hier schon hast."}, "es_419": {"Cancel": "Cancelar", "Choose file…": "Elegir archivo…", "Copied": "Copiado", "Read your save again": "Volver a leer tu partida", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "El navegador pregunta una vez por visita antes de dejar que el Toybox vuelva a leer <b>SaveData.nrgs</b>.", "Read it": "Leer", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Elige <b>SaveData.nrgs</b>. En Windows está en {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Haz clic en COPIAR CARPETA, pégala en la barra de dirección de la ventana de archivos y abre la carpeta Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Se queda en este navegador. Después de cazar más, vuelve a importarla para ver las cacerías nuevas.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Al importar tu partida, aceptas compartir lo de tus abatidos</b> (especie, edad, estado físico, peso, medidas del trofeo) y una copia de tu partida sin tu nombre de cazador, para ayudar a mejorar las puntuaciones de trofeo. Sin nombre, cuenta ni Steam ID. Lo puedes apagar en Ajustes cuando quieras.", "The first time, reading it downloads about 36 MB.": "La primera vez, para leerla se descargan unos 36 MB.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>En un celular o una tablet se puede quedar sin memoria y cerrar la página.</b> Funciona mejor en el navegador de una computadora.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Los navegadores no pueden abrir archivos de tu computadora si no los eliges tú. ¿Quieres que cargue sola? La app del Toybox para Windows encuentra tu partida y la vuelve a leer cada vez que el juego guarda.", "Import your save": "Importa tu partida", "COPY FOLDER": "COPIAR CARPETA", "Import your Toybox data": "Importa tu información del Toybox", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Elige un archivo que exportaste del Toybox (.json). Se suma a lo que ya tienes aquí."}, "es_ES": {"Cancel": "Cancelar", "Choose file…": "Elegir archivo…", "Copied": "Copiado", "Read your save again": "Volver a leer tu partida", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "El navegador pregunta una vez por visita antes de que el Toybox pueda volver a leer <b>SaveData.nrgs</b>.", "Read it": "Leer", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Elige <b>SaveData.nrgs</b>. En Windows está en {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Haz clic en COPIAR CARPETA, pégala en la barra de direcciones de la ventana de archivos y abre la carpeta Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Se queda en este navegador. Cuando caces más, vuelve a importarla para ver las cacerías nuevas.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Al importar tu partida, aceptas compartir tus piezas abatidas</b> (especie, edad, estado físico, peso, medidas del trofeo) y una copia de tu partida sin tu nombre de cazador, para ayudar a mejorar las puntuaciones de trofeo. Sin nombre, cuenta ni Steam ID. Puedes desactivarlo cuando quieras en Configuración.", "The first time, reading it downloads about 36 MB.": "La primera vez, para leerla se descargan unos 36 MB.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>En un móvil o una tablet puede quedarse sin memoria y cerrar la página.</b> Va mejor en el navegador de un ordenador.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Los navegadores no pueden abrir archivos de tu ordenador sin que tú los elijas. ¿Quieres que se cargue sola? La app del Toybox para ordenador encuentra tu partida y la vuelve a leer cada vez que el juego guarda.", "Import your save": "Importar tu partida", "COPY FOLDER": "COPIAR CARPETA", "Import your Toybox data": "Importar tus cosas del Toybox", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Elige un archivo que hayas exportado del Toybox (.json). Se suma a lo que ya tienes aquí."}, "fr": {"Cancel": "Annuler", "Choose file…": "Choisir un fichier…", "Copied": "Copié", "Read your save again": "Relire ta sauvegarde", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "Le navigateur demande une fois par visite avant que le Toybox puisse relire <b>SaveData.nrgs</b>.", "Read it": "La lire", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Choisis <b>SaveData.nrgs</b>. Sous Windows, il est dans {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Clique sur COPIER LE DOSSIER, puis colle-le dans la barre d'adresse de la fenêtre de fichiers et ouvre le dossier Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Elle reste dans ce navigateur. Après d'autres parties de chasse, importe-la de nouveau pour voir tes nouvelles chasses.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>En important ta sauvegarde, tu acceptes de partager tes abattages</b> (espèce, âge, condition physique, poids, mesures du trophée) et une copie de ta sauvegarde sans ton nom de chasseur, pour aider à améliorer les scores de trophée. Ni nom, ni compte, ni Steam ID. Tu peux le couper dans Paramètres quand tu veux.", "The first time, reading it downloads about 36 MB.": "La première fois, la lecture télécharge environ 36 Mo.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>Sur un téléphone ou une tablette, la mémoire peut manquer et la page se fermer.</b> Un navigateur sur PC marche mieux.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Les navigateurs ne peuvent pas ouvrir les fichiers de ton PC sans que tu les choisisses. Tu veux que ça se charge tout seul ? L'appli Toybox pour PC trouve ta sauvegarde et la relit à chaque sauvegarde du jeu.", "Import your save": "Importer ta sauvegarde", "COPY FOLDER": "COPIER LE DOSSIER", "Import your Toybox data": "Importer tes fichiers Toybox", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Choisis un fichier exporté depuis le Toybox (.json). Il s'ajoute à ce que tu as déjà ici."}, "it": {"Cancel": "Annulla", "Choose file…": "Scegli file…", "Copied": "Copiato", "Read your save again": "Rileggi il salvataggio", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "Il browser chiede il permesso una volta per visita prima che il Toybox possa rileggere <b>SaveData.nrgs</b>.", "Read it": "Leggi", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Scegli <b>SaveData.nrgs</b>. Su Windows si trova in {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Clicca COPIA CARTELLA, incollala nella barra degli indirizzi della finestra dei file e apri la cartella Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Resta in questo browser. Dopo altre battute di caccia, importalo di nuovo per vedere le cacce nuove.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Importando il salvataggio accetti di condividere i dati dei tuoi abbattimenti</b> (specie, età, condizione, peso, misure del trofeo) e una copia del salvataggio senza il tuo nome da cacciatore, per aiutare a migliorare i punteggi dei trofei. Nessun nome, account o Steam ID. Puoi disattivarlo quando vuoi in Impostazioni.", "The first time, reading it downloads about 36 MB.": "La prima volta, per leggerlo scarica circa 36 MB.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>Su telefono o tablet la memoria può finire e la pagina si chiude.</b> Un browser su PC va meglio.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "I browser non possono aprire file del tuo PC senza che tu li scelga. Vuoi che si carichi da solo? L'app Toybox per PC trova il tuo salvataggio e lo rilegge ogni volta che il gioco salva.", "Import your save": "Importa il salvataggio", "COPY FOLDER": "COPIA CARTELLA", "Import your Toybox data": "Importa i tuoi dati del Toybox", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Scegli un file che hai esportato dal Toybox (.json). Si aggiunge a quello che hai già qui."}, "ja": {"Cancel": "キャンセル", "Choose file…": "ファイルを選択…", "Copied": "コピーしました", "Read your save again": "セーブデータを読み直す", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "Toyboxが <b>SaveData.nrgs</b> をもう一度読む前に、ブラウザーが訪問ごとに1回確認します。", "Read it": "読み込む", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "<b>SaveData.nrgs</b> を選んでください。Windowsでは次の場所にあります: {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "「フォルダーをコピー」を押してから、ファイル選択画面のアドレスバーに貼り付けて、Accountフォルダーを開いてください。", "It stays in this browser. After more hunting, import it again to see the new hunts.": "セーブデータはこのブラウザーの中に残ります。さらに狩りをしたら、もう一度取り込むと新しい狩りが表示されます。", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>セーブデータを取り込むと、仕留めた獲物の情報の共有に同意したことになります</b>(種、年齢、体質、重量、トロフィーの計測値)。ハンター名を消したセーブデータのコピーも一緒に送られ、トロフィースコアをもっと正確にするのに使われます。名前、アカウント、Steam IDは送られません。「設定」でいつでもオフにできます。", "The first time, reading it downloads about 36 MB.": "初回の読み込みでは約36 MBをダウンロードします。", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>スマホやタブレットではメモリが足りなくなり、ページが閉じることがあります。</b> PCのブラウザーがおすすめです。", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "ブラウザーは、自分で選ばないとPCのファイルを開けません。自動で読み込みたい場合は、PC版のToyboxアプリを使ってください。セーブデータを自分で見つけて、ゲームがセーブするたびに読み直します。", "Import your save": "セーブデータを取り込む", "COPY FOLDER": "フォルダーをコピー", "Import your Toybox data": "Toyboxのデータを取り込む", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Toyboxから書き出したファイル(.json)を選んでください。今ここにあるものに追加されます。"}, "pl": {"Cancel": "Anuluj", "Choose file…": "Wybierz plik…", "Copied": "Skopiowano", "Read your save again": "Wczytaj zapis ponownie", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "Przy każdej wizycie przeglądarka raz pyta, zanim Toybox znowu odczyta <b>SaveData.nrgs</b>.", "Read it": "Wczytaj", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Wybierz <b>SaveData.nrgs</b>. W Windows jest w {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Kliknij KOPIUJ FOLDER, wklej go w pasek adresu okna wyboru pliku i otwórz folder Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Zostaje w tej przeglądarce. Po kolejnych polowaniach zaimportuj go ponownie, żeby zobaczyć nowe łowy.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Importując zapis, zgadzasz się udostępnić informacje o swoich ubiciach</b> (gatunek, wiek, kondycja, waga, wymiary trofeum) oraz kopię zapisu bez twojego imienia myśliwego, żeby ulepszyć punktację trofeów. Bez imienia, konta i Steam ID. Możesz to wyłączyć w każdej chwili w Ustawieniach.", "The first time, reading it downloads about 36 MB.": "Za pierwszym razem odczyt pobiera około 36 MB.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>Na telefonie albo tablecie może zabraknąć pamięci i strona się zamknie.</b> Najlepiej działa przeglądarka na komputerze.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Przeglądarka nie otworzy pliku z twojego komputera, jeśli go nie wybierzesz. Chcesz, żeby wczytywał się sam? Aplikacja Toybox na komputer sama znajduje twój zapis i czyta go ponownie za każdym razem, gdy gra zapisuje stan.", "Import your save": "Zaimportuj swój zapis", "COPY FOLDER": "KOPIUJ FOLDER", "Import your Toybox data": "Zaimportuj swoje dane z Toyboxa", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Wybierz plik wyeksportowany z Toyboxa (.json). Zostanie dodany do tego, co już tu masz."}, "pt_BR": {"Cancel": "Cancelar", "Choose file…": "Escolher arquivo…", "Copied": "Copiado", "COPY FOLDER": "COPIAR PASTA", "Read your save again": "Ler o save de novo", "Read it": "Ler", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "O navegador pergunta uma vez por visita antes de o Toybox poder ler o <b>SaveData.nrgs</b> de novo.", "Import your save": "Importar seu save", "Import your Toybox data": "Importar seus dados do Toybox", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Escolha um arquivo que você exportou do Toybox (.json). Ele é somado ao que você já tem aqui.", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Escolha o <b>SaveData.nrgs</b>. No Windows ele fica em {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Clique em COPIAR PASTA, cole na barra de endereço da janela de arquivos e abra a pasta Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Ele fica neste navegador. Depois de caçar mais, importe de novo para ver as caçadas novas.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Ao importar seu save, você concorda em compartilhar os dados dos seus abates</b> (espécie, idade, condicionamento, peso, medidas do troféu) e uma cópia do seu save sem o seu nome de caçador, para ajudar a melhorar a pontuação dos troféus. Nenhum nome, conta ou Steam ID. Desligue em Ajustes quando quiser.", "The first time, reading it downloads about 36 MB.": "Na primeira vez, a leitura baixa uns 36 MB.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>No celular ou tablet a memória pode acabar e a página fechar.</b> Um navegador no PC funciona melhor.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Navegadores não abrem arquivos do seu PC sem você escolher. Quer que carregue sozinho? O app Toybox para PC acha o seu save e lê de novo toda vez que o jogo salva."}, "ru": {"Cancel": "Отмена", "Choose file…": "Выбрать файл…", "Copied": "Скопировано", "Read your save again": "Прочитать сохранение снова", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "Браузер спрашивает один раз за посещение, прежде чем Toybox сможет снова прочитать <b>SaveData.nrgs</b>.", "Read it": "Прочитать", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "Выбери <b>SaveData.nrgs</b>. В Windows он лежит в {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "Нажми КОПИРОВАТЬ ПАПКУ, вставь путь в адресную строку окна выбора файла и открой папку Account.", "It stays in this browser. After more hunting, import it again to see the new hunts.": "Оно остается в этом браузере. После новой охоты импортируй его снова, чтобы увидеть новую добычу.", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>Импортируя сохранение, ты соглашаешься делиться сведениями о своей добыче</b> (вид, возраст, здоровье, вес, замеры трофея) и копией сохранения без имени охотника, чтобы ценность трофеев стала точнее. Без имени, аккаунта и Steam ID. Выключить можно в любой момент в Настройках.", "The first time, reading it downloads about 36 MB.": "В первый раз для чтения скачивается около 36 МБ.", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>На телефоне или планшете может не хватить памяти, и страница закроется.</b> Лучше всего подходит браузер на ПК.", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "Браузер не может открыть файлы на ПК, пока ты их не выберешь. Хочешь, чтобы все загружалось само? Приложение Toybox для ПК находит сохранение и перечитывает его каждый раз, когда игра сохраняется.", "Import your save": "Импорт сохранения", "COPY FOLDER": "КОПИРОВАТЬ ПАПКУ", "Import your Toybox data": "Импорт данных Toybox", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "Выбери файл, выгруженный из Toybox (.json). Он добавится к тому, что уже есть здесь."}, "zh_Hans": {"Cancel": "取消", "Choose file…": "选择文件…", "Copied": "已复制", "Read your save again": "重新读取存档", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "每次访问时，浏览器会先问你一次，Toybox 才能再次读取 <b>SaveData.nrgs</b>。", "Read it": "读取", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "选择 <b>SaveData.nrgs</b>。在 Windows 上它位于 {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "点击「复制文件夹」，粘贴到文件窗口的地址栏，然后打开 Account 文件夹。", "It stays in this browser. After more hunting, import it again to see the new hunts.": "存档只留在这个浏览器里。打猎之后再导入一次，就能看到新的狩猎。", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>导入存档即表示你同意分享你的击杀信息</b>（物种、年龄、健康值、重量、战利品尺寸）和一份去掉猎人名字的存档副本，用来改进战利品评分。不含名字、账号或 Steam ID。随时可以在「设置」里关闭。", "The first time, reading it downloads about 36 MB.": "第一次读取时会下载约 36 MB。", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>在手机或平板上可能会内存不足，页面会被关闭。</b>最好用电脑浏览器。", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "浏览器不能自己打开你电脑上的文件，必须由你来选。想让它自动加载？电脑版 Toybox 应用会自己找到你的存档，游戏每次保存时都会重新读取。", "Import your save": "导入你的存档", "COPY FOLDER": "复制文件夹", "Import your Toybox data": "导入你的 Toybox 文件", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "选择你从 Toybox 导出的文件（.json）。它会加到你这里已有的内容里。"}, "zh_Hant": {"Cancel": "取消", "Choose file…": "選擇檔案…", "Copied": "已複製", "Read your save again": "重新讀取你的存檔", "The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.": "每次造訪時，瀏覽器會先問一次，Toybox 才能再次讀取 <b>SaveData.nrgs</b>。", "Read it": "讀取", "Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}": "選擇 <b>SaveData.nrgs</b>。在 Windows 上，它位於 {dir}", "Click COPY FOLDER, then paste it into the file box's address bar and open the Account folder.": "點一下「複製資料夾」，貼到檔案視窗的網址列，再開啟 Account 資料夾。", "It stays in this browser. After more hunting, import it again to see the new hunts.": "存檔只會留在這個瀏覽器裡。狩獵更多次之後，再匯入一次就能看到新的狩獵。", "<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.": "<b>匯入存檔，就表示你同意分享你的擊殺紀錄</b>（物種、年齡、體質、重量、戰利品尺寸）和一份去掉獵人名稱的存檔複本，用來幫忙改進戰利品評分。不含名字、帳號或 Steam ID。隨時可以在「設定」中關閉。", "The first time, reading it downloads about 36 MB.": "第一次讀取時會下載大約 36 MB。", "<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.": "<b>在手機或平板上可能會記憶體不足而關閉頁面。</b>用電腦的瀏覽器最好。", "Browsers can't open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.": "沒有你親自選擇，瀏覽器無法開啟你電腦上的檔案。想讓它自己載入？電腦版 Toybox 應用程式會自己找到你的存檔，遊戲每次存檔時都會重新讀取。", "Import your save": "匯入你的存檔", "COPY FOLDER": "複製資料夾", "Import your Toybox data": "匯入你的 Toybox 資料", "Pick a file you exported from the Toybox (.json). It is added to what you have here.": "選擇你從 Toybox 匯出的檔案（.json）。內容會加到你在這裡已有的資料中。"}};
  const L = (en) => ((TEXT[window.toyboxLang] || {})[en]) || en;
  function pickFile(title, text, accept, done, copy) {      // copy: [label, text] puts a button that copies text
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,sans-serif';
    wrap.innerHTML = '<div style="background:#14110d;border:1px solid #6b5a3c;border-radius:12px;padding:22px 24px;max-width:440px;width:calc(100% - 48px);color:#efe6d2;box-shadow:0 10px 40px #000">' +
      '<div style="font-weight:700;font-size:18px;margin-bottom:8px">' + title + '</div>' +
      '<div style="font-size:14px;line-height:1.45;color:#b9ad95;margin-bottom:18px">' + text + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
      (copy ? '<button data-k="copy" style="background:#2a241b;color:#efe6d2;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer;margin-right:auto">' + copy[0] + '</button>' : '') +
      '<button data-k="cancel" style="background:#2a241b;color:#efe6d2;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer">' + L('Cancel') + '</button>' +
      '<button data-k="pick" style="background:#dcc79a;color:#16120c;border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer">' + L('Choose file…') + '</button></div></div>';
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.style.display = 'none';
    wrap.appendChild(input); document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('[data-k=cancel]').onclick = () => { close(); done(null); };
    wrap.querySelector('[data-k=pick]').onclick = () => input.click();          // a real click: the browser allows the picker
    const cp = wrap.querySelector('[data-k=copy]');
    if (cp) cp.onclick = async () => {
      try { await navigator.clipboard.writeText(copy[1]); cp.textContent = L('Copied'); } catch { cp.textContent = copy[1]; }
    };
    input.onchange = () => { const f = input.files && input.files[0]; close(); done(f || null); };
  }
  // Chrome / Edge can keep the picked save file itself (a file handle, kept in this browser), so REFRESH reads it
  // again from disk after more hunting. Other browsers only get a copy: there the save has to be imported again.
  const canKeep = typeof window.showOpenFilePicker === 'function';
  function hdb(mode, fn) {
    return new Promise((ok, bad) => {
      const rq = indexedDB.open('toybox-page', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onerror = () => bad(rq.error);
      rq.onsuccess = () => {
        const tx = rq.result.transaction('kv', mode); const r = fn(tx.objectStore('kv'));
        tx.oncomplete = () => ok(r && r.result); tx.onerror = () => bad(tx.error);
      };
    });
  }
  const keepHandle = (h) => hdb('readwrite', (st) => st.put(h, 'save')).catch(() => {});
  const keptHandle = () => hdb('readonly', (st) => st.get('save')).catch(() => null);
  async function sendFile(f, cb) {
    const buf = await f.arrayBuffer();
    send({ op: 'save', bytes: buf, mtime: f.lastModified || 0 }, cb, [buf]);   // the file's own date = when the game saved it
  }
  function askOnce(title, text, button, go) {        // a real click on the page, which the browser wants before it asks
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,sans-serif';
    wrap.innerHTML = '<div style="background:#14110d;border:1px solid #6b5a3c;border-radius:12px;padding:22px 24px;max-width:440px;width:calc(100% - 48px);color:#efe6d2;box-shadow:0 10px 40px #000">' +
      '<div style="font-weight:700;font-size:18px;margin-bottom:8px">' + title + '</div>' +
      '<div style="font-size:14px;line-height:1.45;color:#b9ad95;margin-bottom:18px">' + text + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      '<button data-k="cancel" style="background:#2a241b;color:#efe6d2;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer">' + L('Cancel') + '</button>' +
      '<button data-k="go" style="background:#dcc79a;color:#16120c;border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer">' + button + '</button></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('[data-k=cancel]').onclick = () => { wrap.remove(); go(false); };
    wrap.querySelector('[data-k=go]').onclick = () => { wrap.remove(); go(true); };
  }
  // REFRESH: read the kept save file again. cb('{"ok":true,"fresh":true}') when it was read,
  // '{"ok":true,"fresh":false,"why":"copy"|"denied"|"gone"}' when only the stored copy is there
  window.toyboxRereadSave = async (cb) => {
    const no = (why) => cb(JSON.stringify({ ok: true, fresh: false, why }));
    const h = canKeep ? await keptHandle() : null;
    if (!h) return no('copy');
    const read = async () => {
      try { await sendFile(await h.getFile(), (out) => cb(out && out.includes('"ok"') ? '{"ok":true,"fresh":true}' : out)); }
      catch { no('gone'); }                           // moved or deleted since it was picked
    };
    let p = 'prompt';
    try { p = await h.queryPermission({ mode: 'read' }); } catch { /* old browser */ }
    if (p === 'granted') return read();
    askOnce(L('Read your save again'), L('The browser asks once per visit before the Toybox may read <b>SaveData.nrgs</b> again.'), L('Read it'), async (yes) => {
      if (!yes) return no('denied');
      try { p = await h.requestPermission({ mode: 'read' }); } catch { p = 'denied'; }
      if (p === 'granted') read(); else no('denied');
    });
  };
  // the player picks their save; cb('{"ok":true,"path":...}' | '' when nothing was picked)
  // (a browser can never open a file on the PC by itself: the player picks it. The desktop app finds it on its own.)
  const SAVE_DIR = '%LOCALAPPDATA%\\WOTH2\\Saved\\SaveGames';
  const saveText = () => L('Pick <b>SaveData.nrgs</b>. On Windows it is in {dir}').replace('{dir}', SAVE_DIR + '\\Account_…') + '<br>' +
    L('Click COPY FOLDER, then paste it into the file box\'s address bar and open the Account folder.') + '<br>' +
    L('It stays in this browser. After more hunting, import it again to see the new hunts.') +
    '<br><br>' + L('<b>By importing your save, you agree to share your kill data</b> (species, age, fitness, weight, trophy measurements) and a copy of your save with your hunter name taken out, to help make trophy scores better. No name, account or Steam ID. Turn it off in Settings any time.') + '<br> ' +
    L('The first time, reading it downloads about 36 MB.') +
    (matchMedia('(pointer: coarse)').matches ? '<br><br>' + L('<b>On a phone or tablet this can run out of memory and close the page.</b> A PC browser works best.') : '') +
    '<br><br>' + L('Browsers can\'t open files on your PC without you picking them. Want it to load by itself? The desktop Toybox app finds your save and reads it again every time the game saves.');
  // Always the plain file box: Chrome / Edge's keep-the-file picker refuses anything in AppData ("contains system
  // files"), and that is where the save lives. A save picked again replaces any file kept from before.
  window.toyboxPickSave = (cb) => pickFile(L('Import your save'),
    saveText(), '.nrgs,.bak', async (f) => {
      if (!f) { cb(''); return; }
      hdb('readwrite', (st) => st.delete('save')).catch(() => {});
      sendFile(f, cb);
    }, [L('COPY FOLDER'), SAVE_DIR]);
  window.toyboxForgetSave = (cb) => { hdb('readwrite', (st) => st.delete('save')).catch(() => {}); send({ op: 'forget-save' }, cb); };
  // a text file the player picks (Toybox data / notes import); cb('') when nothing was picked
  window.toyboxPickText = (cb) => pickFile(L('Import your Toybox data'), L('Pick a file you exported from the Toybox (.json). It is added to what you have here.'),
    '.json,application/json', async (f) => cb(f ? await f.text() : ''));
  window.toyboxBase = () => document.baseURI;
  // tests: hand the core a save directly (ArrayBuffer)
  window.toyboxPutSave = (buf, cb) => send({ op: 'save', bytes: buf }, cb || (() => {}), [buf]);
  // The engine (index.wasm, 44 MB) and the app (index.pck) are kept in this browser by what is in them: the site
  // only lets a browser keep a file 10 minutes and every release looks new to it, so each visit after a release
  // downloaded both again. Now a visit only downloads what really changed (the engine almost never does).
  // Both start downloading here, before the page has even loaded the engine's loader. build_web.sh fills in KEEP:
  // {address the engine asks for: fingerprint}.
  const KEEP = { 'index.wasm': 'e4a43dbae28662b2', 'index.pck?v=25043234e81aa795': '25043234e81aa795' };
  if (Object.keys(KEEP).length && typeof caches !== 'undefined') {
    const real = window.fetch.bind(window);
    const keyOf = (rel) => base + rel + (rel.includes('?') ? '&' : '?') + 'keep=' + KEEP[rel];
    const load = async (rel) => {
      let c = null;
      try { c = await caches.open('toybox-engine'); const hit = await c.match(keyOf(rel)); if (hit) return hit; } catch { c = null; }
      const r = await real(base + rel, { credentials: 'same-origin' });
      if (!c || !r.ok || !r.body) return r;
      // the engine reads the download as it comes in (it starts compiling before the end); the pieces are kept and
      // stored once it is all there. (Not r.clone(): Chrome often never finished storing a clone of the 44 MB file.)
      const parts = [], rd = r.body.getReader(), type = r.headers.get('Content-Type') || '';
      const body = new ReadableStream({
        async pull(ctl) {
          const { done, value } = await rd.read();
          if (!done) { parts.push(value); ctl.enqueue(value); return; }
          ctl.close();
          const blob = new Blob(parts); parts.length = 0;
          const want = new Set(Object.keys(KEEP).map(keyOf));      // kept for next time; older versions are let go
          c.put(keyOf(rel), new Response(blob, { headers: { 'Content-Type': type } })).then(() => c.keys())
            .then((ks) => Promise.all(ks.filter((k) => !want.has(k.url)).map((k) => c.delete(k)))).catch(() => {});
        },
        cancel(why) { return rd.cancel(why); },
      });
      return new Response(body, { status: r.status, statusText: r.statusText, headers: { 'Content-Type': type } });
    };
    const early = {};
    for (const rel of Object.keys(KEEP)) { early[rel] = load(rel); early[rel].catch(() => {}); }
    window.fetch = function (input, init) {
      const rel = typeof input === 'string' ? (input.startsWith(base) ? input.slice(base.length) : input) : '';
      if (!(rel in KEEP)) return real(input, init);
      const p = early[rel] || load(rel); delete early[rel];     // the early download once, a fresh one on a retry
      return p;
    };
  }
})();
