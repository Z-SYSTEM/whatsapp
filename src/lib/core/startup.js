const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

async function preStartupCheck(BOT_NAME, puerto, SESSION_PATH, HEALTHCHECK_URL) {
    // 1. Health check HTTP
    console.info('[BOOT] [STEP 1] Verificando si hay otra instancia activa...');
    let botResponding = false;
    try {
        console.info(`[BOOT] [STEP 1.1] Haciendo GET a ${HEALTHCHECK_URL}`);
        await new Promise((resolve, reject) => {
            const req = http.get(HEALTHCHECK_URL, res => {
                console.info(`[BOOT] [STEP 1.2] Respuesta HTTP status: ${res.statusCode}`);
                if (res.statusCode === 200) botResponding = true;
                resolve();
            });
            req.on('error', (err) => {
                console.info(`[BOOT] [STEP 1.3] Error al hacer GET: ${err && err.message}`);
                resolve();
            }); // Si falla, asumimos que no responde
            req.setTimeout(2000, () => { 
                console.info('[BOOT] [STEP 1.4] Timeout en GET, abortando');
                req.abort(); 
                resolve(); 
            });
        });
    } catch (e) { 
        console.info(`[BOOT] [STEP 1.5] Excepción en healthcheck: ${e && e.message}`);
    }

    if (botResponding) {
        // Ya hay un bot respondiendo en este puerto
        console.error('[BOOT] [STEP 1.6] Hay respuesta de otra instancia, me mato.');
        process.exit(1);
    } else {
        console.info('[BOOT] [STEP 1.7] No hay otra instancia, arranco.');
    }

    // 2. Verificar SingletonLock
    const SINGLETON_LOCK = `${SESSION_PATH}/SingletonLock`;
    console.info('[BOOT] [STEP 2] Verificando SingletonLock...');
    if (fs.existsSync(SINGLETON_LOCK)) {
        console.info('[BOOT] [STEP 2.1] SingletonLock encontrado, buscando procesos Chrome/Chromium...');
        let psOutput = '';
        let killed = 0;
        try {
            // Usar comando compatible con Windows
            if (process.platform === 'win32') {
                psOutput = execSync(`tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV`).toString();
            } else {
                // Comando mejorado para Linux que busca procesos relacionados con la sesión
                psOutput = execSync(`ps aux | grep -E '(chrome|chromium).*${SESSION_PATH.replace(/\//g, '\\/')}'`).toString();
            }
            console.info('[BOOT] [STEP 2.2] Salida de proceso obtenida.');
        } catch (e) { 
            console.info('[BOOT] [STEP 2.3] No se encontraron procesos Chrome/Chromium.');
        }
        if (psOutput) {
            const lines = psOutput.split('\n');
            for (const line of lines) {
                if (line.includes(`--user-data-dir=${SESSION_PATH}`)) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[1];
                    if (pid && !isNaN(pid)) {
                        try {
                            process.kill(pid, 'SIGKILL');
                            killed++;
                            console.info(`[BOOT] [STEP 2.4] Proceso Chrome/Chromium con PID ${pid} matado.`);
                        } catch (e) { 
                            console.info(`[BOOT] [STEP 2.5] Error al matar PID ${pid}: ${e && e.message}`);
                        }
                    }
                }
            }
        }
        if (killed > 0) {
            console.warn(`[PRE-STARTUP] Se mataron ${killed} procesos Chrome/Chromium de la sesión ${SESSION_PATH}.`);
        } else {
            console.warn(`[PRE-STARTUP] SingletonLock presente pero no se encontraron procesos Chrome/Chromium de la sesión. Borrando lock...`);
        }
        fs.unlinkSync(SINGLETON_LOCK);
        console.info('[BOOT] [STEP 2.6] SingletonLock eliminado.');
    } else {
        console.info('[BOOT] [STEP 2.7] No existe SingletonLock, continuando.');
    }

    // 3. Limpieza adicional de procesos Chrome zombie (Linux)
    if (process.platform !== 'win32') {
        console.info('[BOOT] [STEP 3] Limpieza adicional de procesos Chrome zombie...');
        try {
            execSync(`pkill -f 'chrome.*--user-data-dir.*${SESSION_PATH}'`, { stdio: 'ignore' });
            console.info('[BOOT] [STEP 3.1] Procesos Chrome zombie eliminados.');
        } catch (e) {
            console.info('[BOOT] [STEP 3.2] No se encontraron procesos Chrome zombie o error al eliminar.');
        }
    }
}

module.exports = { preStartupCheck };
