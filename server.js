const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = 3001;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

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
app.use(express.static('public'));

// ===== Estado dos jogos em memória =====
const salas = {};
const categoriasPalavras = {
    animais: ['elefante', 'gato', 'girafa', 'tartaruga', 'jacare'],
    frutas: ['abacaxi', 'melancia', 'chocolate', 'lasanha', 'miojo'],
    paises: ['brasil', 'japao', 'argentina', 'madri', 'ottawa'],
    profissoes: ['engenheiro', 'professor', 'dentista', 'bombeiro', 'advogado'],
    filmes: ['titanic', 'batman', 'friends', 'shrek', 'matrix'],
    objetos: ['geladeira', 'caderno', 'telefone', 'abajur', 'chinelo'],
    cores: ['vermelho', 'turquesa', 'amarelo', 'lilas', 'marrom'],
    esportes: ['futebol', 'basquete', 'natacao', 'volei', 'rugby'],
    desenhos: ['naruto', 'pokemon', 'simpsons', 'scooby', 'doraemon'],
    marcas: ['nike', 'coca', 'google', 'netflix', 'spotify']
};
const temasVisuais = ['classico', 'halloween', 'neon'];

// ===== Lógica do jogo da forca 1v1 =====
io.on('connection', (socket) => {
    console.log('Jogador conectado:', socket.id);

    // Entrar numa sala (máx. 2 jogadores)
    socket.on('entrarSala', (dados = {}) => {
        const { sala, apelido, tema, categoria, acao } = dados;
        if (typeof sala !== 'string' || !sala.trim() || typeof apelido !== 'string' || !apelido.trim()) {
            return socket.emit('erro', 'Informe o ID da sala e seu apelido.');
        }

        const salaId = acao ? sala.trim().toUpperCase() : sala;
        if (acao === 'entrar' && !salas[salaId]) {
            return socket.emit('salaNaoEncontrada');
        }
        if (acao === 'criar' && salas[salaId]) {
            return socket.emit('erro', 'Este ID de sala já existe. Tente criar outra sala.');
        }
        if (acao === 'criar' && !Object.prototype.hasOwnProperty.call(categoriasPalavras, categoria)) {
            return socket.emit('erro', 'Escolha uma categoria válida.');
        }

        if (!salas[salaId]) {
            const palavras = categoriasPalavras[categoria];
            const palavra = palavras
                ? palavras[Math.floor(Math.random() * palavras.length)]
                : '';
            salas[salaId] = {
                jogadores: [],
                palavra,
                letrasUsadas: [],
                erros: 0,
                maxErros: 6,
                vez: 0,
                tema: temasVisuais.includes(tema) ? tema : 'classico',
                categoria: palavras ? categoria : null
            };
        }
        const s = salas[salaId];

        if (s.jogadores.length >= 2) {
            return socket.emit('salaCheia');
        }

        socket.join(salaId);
        socket.data.sala = salaId;
        s.jogadores.push({ id: socket.id, apelido: apelido.trim() });

        socket.emit('permissaoDefinirPalavra', {
            podeDefinir: s.jogadores[0].id === socket.id,
            palavraDefinida: Boolean(s.palavra)
        });
        io.to(salaId).emit('aplicarTema', { tema: s.tema });
        io.to(salaId).emit('jogadoresAtualizados', s.jogadores.map(j => j.apelido));
        io.to(salaId).emit('salaInfo', {
            id: salaId,
            tema: s.categoria,
            categoria: s.categoria,
            temaVisual: s.tema,
            jogadores: s.jogadores.map(j => j.apelido)
        });

        if (s.jogadores.length === 2) {
            io.to(salaId).emit('iniciarPartida', { vezDe: s.jogadores[0].apelido });
        }
    });

    // Um dos jogadores define a palavra secreta
    socket.on('definirPalavra', ({ sala, palavra }) => {
        const s = salas[sala];
        if (!s) {
            return socket.emit('erro', 'Sala não encontrada.');
        }
        if (s.jogadores[0].id !== socket.id) {
            return socket.emit('erro', 'Somente quem criou a sala pode definir a palavra.');
        }
        if (s.palavra) {
            return socket.emit('erro', 'A palavra secreta já foi definida.');
        }

        const palavraNormalizada = typeof palavra === 'string' ? palavra.trim().toLowerCase() : '';
        if (!palavraNormalizada) {
            return socket.emit('erro', 'Digite uma palavra secreta.');
        }

        s.palavra = palavraNormalizada;
        io.to(sala).emit('palavraDefinida');
    });

    // Jogador da vez chuta uma letra
    socket.on('chutarLetra', ({ sala, letra }) => {
        const s = salas[sala];
        if (!s || s.jogadores.length < 2) return;
        if (!s.palavra) {
            return socket.emit('erro', 'A palavra secreta ainda não foi definida.');
        }

        const jogadorAtual = s.jogadores[s.vez];
        if (jogadorAtual.id !== socket.id) {
            return socket.emit('erro', 'Não é sua vez!');
        }
        if (s.letrasUsadas.includes(letra)) {
            return socket.emit('erro', 'Letra já usada!');
        }

        s.letrasUsadas.push(letra);
        if (!s.palavra.includes(letra)) s.erros++;

        const ganhou = s.palavra.split('').every(l => s.letrasUsadas.includes(l));
        const perdeu = s.erros >= s.maxErros;
        if (!perdeu && !ganhou) {
            s.vez = (s.vez + 1) % 2;
        }

        const estado = {
            letrasUsadas: s.letrasUsadas,
            erros: s.erros,
            vezDe: s.jogadores[s.vez].apelido,
            perdeu,
            ganhou
        };
        if (perdeu || ganhou) {
            estado.palavra = s.palavra;
        }
        io.to(sala).emit('estadoAtualizado', estado);
    });

    // Jogador desconectou
    socket.on('disconnect', () => {
        const sala = socket.data.sala;
        if (sala && salas[sala]) {
            socket.to(sala).emit('oponenteSaiu');
            delete salas[sala];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor do jogo rodando em http://localhost:${PORT}`);
});