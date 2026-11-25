const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'script.js'));
});
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

const TEMPO_LIMITE = 15000; // 15s por jogada
const salas = {};

// ==================== HELPERS ====================
function normalizarPalavra(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function broadcastEstado(sala) {
    const s = salas[sala];
    if (!s) return null;

    const letrasDaPalavra = s.palavra.split('').filter((ch) => ch !== ' ');
    const palavraMascarada = s.palavra
        .split('')
        .map((ch) => {
            if (ch === ' ') return '\u00A0\u00A0';
            return s.letrasUsadas.includes(ch) ? ch : '_';
        })
        .join(' ');

    const acabou = s.erros >= s.maxErros;
    const ganhou = letrasDaPalavra.length > 0 && letrasDaPalavra.every((l) => s.letrasUsadas.includes(l));

    if (acabou || ganhou) {
        s.emAndamento = false;
        clearTimeout(s.timer);
    }

    const estado = {
        letrasUsadas: s.letrasUsadas,
        erros: s.erros,
        maxErros: s.maxErros,
        palavraMascarada,
        acabou,
        ganhou,
        vezDe: s.adivinhadores[s.vez]?.apelido || null,
        vezId: s.adivinhadores[s.vez]?.id || null
    };

    if (acabou || ganhou) {
        estado.palavra = s.palavra;
    }

    io.to(sala).emit('estadoAtualizado', estado);
    return estado;
}

function passarVez(sala) {
    const s = salas[sala];
    if (!s || !s.emAndamento || s.adivinhadores.length === 0) return;
    clearTimeout(s.timer);
    s.vez = (s.vez + 1) % s.adivinhadores.length;
    iniciarTemporizador(sala);
}

function iniciarTemporizador(sala) {
    const s = salas[sala];
    if (!s || !s.emAndamento || s.adivinhadores.length === 0) return;

    clearTimeout(s.timer);
    const atual = s.adivinhadores[s.vez];
    if (!atual) return;

    io.to(sala).emit('vezDoJogador', {
        id: atual.id,
        apelido: atual.apelido,
        tempo: TEMPO_LIMITE / 1000
    });

    s.timer = setTimeout(() => {
        if (!s.emAndamento) return;
        s.erros++;
        io.to(sala).emit('fimDeTempo', { apelido: atual.apelido });
        const estado = broadcastEstado(sala);
        if (estado && !estado.acabou && !estado.ganhou) {
            passarVez(sala);
        }
    }, TEMPO_LIMITE);
}

function emitJogadores(sala) {
    const s = salas[sala];
    if (!s) return;
    io.to(sala).emit('jogadoresAtualizados', {
        anfitriao: s.anfitriao.apelido,
        adivinhadores: s.adivinhadores.map((a) => a.apelido),
        faltam: s.maxAdivinhadores - s.adivinhadores.length
    });
}

// ==================== CONEXÃO ====================
io.on('connection', (socket) => {
    console.log('Conectado:', socket.id);

    socket.on('criarSala', ({ apelido, tema, palavra, maxAdivinhadores }) => {
        const apelidoLimpo = (apelido || '').trim();
        const palavraLimpa = normalizarPalavra(palavra || '');
        const max = parseInt(maxAdivinhadores, 10);

        if (!apelidoLimpo) return socket.emit('erro', 'Apelido inválido!');
        if (!palavraLimpa || !/^[a-z\s]+$/.test(palavraLimpa)) {
            return socket.emit('erro', 'Digite uma palavra válida (apenas letras, sem números ou símbolos)!');
        }
        if (!tema) return socket.emit('erro', 'Tema é obrigatório!');
        if (isNaN(max) || max < 1 || max > 4) {
            return socket.emit('erro', 'Escolha entre 1 e 4 adivinhadores!');
        }

        let salaId;
        do {
            salaId = gerarIdSala();
        } while (salas[salaId]);

        salas[salaId] = {
            anfitriao: { id: socket.id, apelido: apelidoLimpo },
            tema,
            palavra: palavraLimpa,
            adivinhadores: [],
            maxAdivinhadores: max,
            letrasUsadas: [],
            erros: 0,
            maxErros: 6,
            vez: 0,
            timer: null,
            emAndamento: false
        };

        socket.join(salaId);
        socket.data.sala = salaId;
        socket.data.papel = 'anfitriao';

        socket.emit('salaCriada', { id: salaId, tema, maxAdivinhadores: max });
        emitJogadores(salaId);
        broadcastEstado(salaId);
    });

    socket.on('entrarSala', ({ sala, apelido }) => {
        const codigo = (sala || '').trim().toUpperCase();
        const apelidoLimpo = (apelido || '').trim();
        const s = salas[codigo];

        if (!apelidoLimpo) return socket.emit('erro', 'Apelido inválido!');
        if (!s) return socket.emit('erro', 'Sala não encontrada!');
        if (s.adivinhadores.length >= s.maxAdivinhadores) return socket.emit('erro', 'Sala cheia!');
        if (s.emAndamento) return socket.emit('erro', 'Partida já em andamento!');

        socket.join(codigo);
        socket.data.sala = codigo;
        socket.data.papel = 'adivinhador';
        s.adivinhadores.push({ id: socket.id, apelido: apelidoLimpo });

        socket.emit('salaEntrou', {
            id: codigo,
            tema: s.tema,
            maxAdivinhadores: s.maxAdivinhadores
        });

        emitJogadores(codigo);
        broadcastEstado(codigo);
    });

    socket.on('iniciarJogo', () => {
        const sala = socket.data.sala;
        const s = salas[sala];
        if (!s || s.anfitriao.id !== socket.id) return socket.emit('erro', 'Só o anfitrião inicia!');
        if (s.adivinhadores.length === 0) return socket.emit('erro', 'Precisa de pelo menos 1 adivinhador!');

        s.emAndamento = true;
        s.erros = 0;
        s.letrasUsadas = [];
        s.vez = 0;

        io.to(sala).emit('partidaIniciada');
        broadcastEstado(sala);
        iniciarTemporizador(sala);
    });

    socket.on('chutarLetra', ({ letra }) => {
        const sala = socket.data.sala;
        const s = salas[sala];
        if (!s || !s.emAndamento) return;

        const atual = s.adivinhadores[s.vez];
        if (!atual || atual.id !== socket.id) return socket.emit('erro', 'Não é sua vez!');

        const limpa = normalizarPalavra(letra || '');
        if (!/^[a-z]$/.test(limpa)) return socket.emit('erro', 'Digite uma única letra válida!');
        if (s.letrasUsadas.includes(limpa)) return socket.emit('erro', 'Letra já usada!');

        s.letrasUsadas.push(limpa);
        if (!s.palavra.includes(limpa)) {
            s.erros++;
        }

        const estado = broadcastEstado(sala);
        if (estado && !estado.acabou && !estado.ganhou) {
            passarVez(sala);
        }
    });

    socket.on('enviarDica', ({ dica }) => {
        const sala = socket.data.sala;
        const s = salas[sala];
        if (!s || s.anfitriao.id !== socket.id) return socket.emit('erro', 'Só o anfitrião envia dicas!');
        const texto = (dica || '').trim();
        if (!texto) return;

        io.to(sala).emit('novaDica', {
            de: s.anfitriao.apelido,
            texto,
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('novaRodada', ({ palavra, tema }) => {
        const sala = socket.data.sala;
        const s = salas[sala];
        if (!s) return socket.emit('erro', 'Sala não encontrada.');
        if (s.anfitriao.id !== socket.id) return socket.emit('erro', 'Só o anfitrião pode iniciar um novo jogo!');

        const palavraLimpa = normalizarPalavra(palavra || '');
        if (!palavraLimpa || !/^[a-z\s]+$/.test(palavraLimpa)) {
            return socket.emit('erro', 'Digite uma palavra válida (apenas letras e espaços)!');
        }

        clearTimeout(s.timer);
        s.palavra = palavraLimpa;
        if (tema) s.tema = tema;
        s.letrasUsadas = [];
        s.erros = 0;
        s.vez = 0;
        s.emAndamento = false;

        io.to(sala).emit('rodadaPreparada', {
            tema: s.tema,
            anfitriao: s.anfitriao.apelido,
            adivinhadores: s.adivinhadores.map((a) => a.apelido),
            faltam: s.maxAdivinhadores - s.adivinhadores.length
        });

        broadcastEstado(sala);
    });

    socket.on('encerrarSala', () => {
        const sala = socket.data.sala;
        const s = salas[sala];
        if (!s) return;
        if (s.anfitriao.id !== socket.id) return socket.emit('erro', 'Só o anfitrião pode encerrar a sala!');

        clearTimeout(s.timer);
        io.to(sala).emit('salaEncerrada');
        delete salas[sala];
    });

    socket.on('disconnect', () => {
        const sala = socket.data.sala;
        if (!sala || !salas[sala]) return;
        const s = salas[sala];

        if (socket.data.papel === 'anfitriao') {
            clearTimeout(s.timer);
            io.to(sala).emit('salaEncerrada');
            delete salas[sala];
        } else {
            const quemSaiuEraDaVez = s.adivinhadores[s.vez]?.id === socket.id;
            s.adivinhadores = s.adivinhadores.filter((a) => a.id !== socket.id);

            if (s.adivinhadores.length === 0) {
                s.emAndamento = false;
                clearTimeout(s.timer);
            } else if (s.emAndamento) {
                if (s.vez >= s.adivinhadores.length) {
                    s.vez = 0;
                }
                if (quemSaiuEraDaVez) {
                    iniciarTemporizador(sala);
                }
            }

            emitJogadores(sala);
        }
    });
});

function gerarIdSala(tamanho = 6) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < tamanho; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

server.listen(PORT, () => console.log(`🎮 http://localhost:${PORT}`));