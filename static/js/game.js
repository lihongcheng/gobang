document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const board = document.getElementById('board');
    const gameStatus = document.getElementById('gameStatus');
    const undoBtn = document.getElementById('undoBtn');
    const roomId = document.getElementById('roomId').textContent;
    const gameWinner = document.getElementById('gameWinner');
    const winnerText = document.getElementById('winnerText');
    const restartBtn = document.getElementById('restartBtn');
    const undoRequestModal = document.getElementById('undoRequestModal');
    const acceptUndoBtn = document.getElementById('acceptUndoBtn');
    const rejectUndoBtn = document.getElementById('rejectUndoBtn');
    
    // 游戏状态变量
    let deviceId = null;
    let playerType = null; // 'player' 或 'viewer'
    let playerColor = null; // 'black' 或 'white'
    let currentTurn = 'black'; // 当前回合
    let gameBoard = Array(14).fill().map(() => Array(14).fill(null)); // 棋盘状态
    let gameOver = false;
    let winner = null;
    let pendingUndoRequest = false;
    let lastMove = null; // 记录最后一步棋的位置
    
    // 初始化Socket.IO连接
    const socket = io();
    
    // 初始化设备指纹
    initFingerprint();
    
    // 渲染棋盘
    initializeBoard();
    
    // 初始化事件监听器
    undoBtn.addEventListener('click', requestUndo);
    restartBtn.addEventListener('click', restartGame);
    acceptUndoBtn.addEventListener('click', () => respondToUndoRequest(true));
    rejectUndoBtn.addEventListener('click', () => respondToUndoRequest(false));
    
    // Socket.IO 事件处理
    socket.on('join_response', handleJoinResponse);
    socket.on('room_update', updateRoomInfo);
    socket.on('game_update', updateGame);
    socket.on('game_over', handleGameOver);
    socket.on('undo_request', handleUndoRequest);
    socket.on('undo_accepted', handleUndoAccepted);
    socket.on('undo_rejected', handleUndoRejected);
    socket.on('game_restart', handleGameRestart);
    
    // 初始化设备指纹
    function initFingerprint() {
        Fingerprint2.get(function(components) {
            const values = components.map(function(component) { return component.value });
            deviceId = Fingerprint2.x64hash128(values.join(''), 31);
            
            // 加入房间
            socket.emit('join', {
                room: roomId,
                device_id: deviceId
            });
        });
    }
    
    // 初始化棋盘
    function initializeBoard() {
        // 清空棋盘
        board.innerHTML = '';
        
        // 创建14x14的棋盘格
        for (let row = 0; row < 14; row++) {
            for (let col = 0; col < 14; col++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = row;
                cell.dataset.col = col;
                cell.addEventListener('click', () => handleCellClick(row, col));
                board.appendChild(cell);
            }
        }
    }
    
    // 处理单元格点击
    function handleCellClick(row, col) {
        // 如果不是玩家，是观战者，或游戏已结束，则不处理点击
        if (playerType !== 'player' || gameOver) {
            return;
        }
        
        // 如果不是当前玩家的回合，则不处理点击
        if (playerColor !== currentTurn) {
            return;
        }
        
        // 如果该位置已经有棋子，则不处理点击
        if (gameBoard[row][col] !== null) {
            return;
        }
        
        // 发送走棋事件
        socket.emit('make_move', {
            room: roomId,
            device_id: deviceId,
            row: row,
            col: col
        });
    }
    
    // 处理加入房间响应
    function handleJoinResponse(data) {
        playerType = data.player_type;
        
        if (playerType === 'player') {
            playerColor = data.color;
            const colorText = playerColor === 'black' ? '黑棋' : '白棋';
            gameStatus.textContent = `你是${colorText}，请等待对手加入...`;
            
            if (data.room_data.players.length === 2) {
                updateGameStatus();
            }
        } else {
            gameStatus.textContent = '你是观战者';
        }
        
        // 更新游戏状态
        updateGame(data.room_data);
    }
    
    // 更新房间信息
    function updateRoomInfo(data) {
        if (data.players.length === 2) {
            updateGameStatus();
        } else {
            const colorText = playerColor === 'black' ? '黑棋' : '白棋';
            gameStatus.textContent = playerType === 'player' ? 
                `你是${colorText}，请等待对手加入...` : 
                '你是观战者，请等待玩家加入...';
        }
    }
    
    // 更新游戏状态
    function updateGame(data) {
        gameBoard = data.board;
        currentTurn = data.current_turn;
        gameOver = data.game_over;
        winner = data.winner;
        
        // 获取最后一步棋
        if (data.moves && data.moves.length > 0) {
            lastMove = data.moves[data.moves.length - 1];
        } else {
            lastMove = null;
        }
        
        // 更新棋盘显示
        renderBoard();
        
        // 更新游戏状态
        if (!gameOver) {
            updateGameStatus();
        }
        
        // 更新悔棋按钮状态
        updateUndoButton();
    }
    
    // 更新游戏状态显示
    function updateGameStatus() {
        if (playerType === 'player') {
            const currentTurnText = currentTurn === 'black' ? '黑棋' : '白棋';
            if (currentTurn === playerColor) {
                gameStatus.textContent = `轮到你(${currentTurnText})走棋了`;
            } else {
                const opponentColor = playerColor === 'black' ? '白棋' : '黑棋';
                gameStatus.textContent = `等待对方(${currentTurnText})走棋`;
            }
        } else {
            const currentTurnText = currentTurn === 'black' ? '黑棋' : '白棋';
            gameStatus.textContent = `当前是${currentTurnText}回合`;
        }
    }
    
    // 更新悔棋按钮状态
    function updateUndoButton() {
        if (playerType === 'player' && !gameOver) {
            // 只有在不是自己回合时才能请求悔棋
            undoBtn.disabled = (currentTurn === playerColor) || pendingUndoRequest;
        } else {
            undoBtn.disabled = true;
        }
    }
    
    // 请求悔棋
    function requestUndo() {
        socket.emit('request_undo', {
            room: roomId,
            device_id: deviceId
        });
        
        pendingUndoRequest = true;
        gameStatus.textContent = '已发送悔棋请求，等待对手回应...';
        undoBtn.disabled = true;
    }
    
    // 响应悔棋请求
    function respondToUndoRequest(accepted) {
        socket.emit('undo_response', {
            room: roomId,
            accepted: accepted
        });
        
        undoRequestModal.classList.add('hidden');
    }
    
    // 处理悔棋请求
    function handleUndoRequest(data) {
        // 只有当前是玩家的回合，并且有已经完成的移动时才显示悔棋请求
        if (playerType === 'player' && currentTurn === playerColor && gameBoard.some(row => row.some(cell => cell !== null))) {
            undoRequestModal.classList.remove('hidden');
        }
    }
    
    // 处理接受悔棋
    function handleUndoAccepted() {
        pendingUndoRequest = false;
        if (playerType === 'player') {
            gameStatus.textContent = '对手同意悔棋';
        }
    }
    
    // 处理拒绝悔棋
    function handleUndoRejected() {
        pendingUndoRequest = false;
        if (playerType === 'player' && currentTurn !== playerColor) {
            gameStatus.textContent = '对手拒绝悔棋请求';
            setTimeout(() => {
                updateGameStatus();
                updateUndoButton();
            }, 2000);
        }
    }
    
    // 处理游戏结束
    function handleGameOver(data) {
        gameOver = true;
        winner = data.winner;
        
        const winnerColorText = winner === 'black' ? '黑棋' : '白棋';
        winnerText.textContent = `${winnerColorText}获胜！`;
        gameWinner.classList.remove('hidden');
        
        // 创建烟花效果
        createFireworks();
    }
    
    // 重新开始游戏
    function restartGame() {
        socket.emit('restart_game', {
            room: roomId
        });
    }
    
    // 处理游戏重新开始
    function handleGameRestart(data) {
        gameOver = false;
        winner = null;
        gameBoard = data.board;
        currentTurn = data.current_turn;
        pendingUndoRequest = false;
        lastMove = null;
        
        // 交换玩家颜色
        if (playerType === 'player') {
            const player = data.players.find(p => p.id === deviceId);
            if (player) {
                playerColor = player.color;
            }
        }
        
        // 更新显示
        renderBoard();
        updateGameStatus();
        updateUndoButton();
        
        // 隐藏胜利消息
        gameWinner.classList.add('hidden');
    }
    
    // 渲染棋盘
    function renderBoard() {
        // 获取所有单元格
        const cells = document.querySelectorAll('.cell');
        
        // 清除所有棋子
        cells.forEach(cell => {
            cell.innerHTML = '';
        });
        
        // 根据游戏状态放置棋子
        for (let row = 0; row < 14; row++) {
            for (let col = 0; col < 14; col++) {
                if (gameBoard[row][col]) {
                    const cellIndex = row * 14 + col;
                    const cell = cells[cellIndex];
                    
                    const piece = document.createElement('div');
                    piece.classList.add('piece', gameBoard[row][col]);
                    
                    // 如果是最后一步棋，添加特殊标记
                    if (lastMove && lastMove.row === row && lastMove.col === col) {
                        piece.classList.add('last-move');
                    }
                    
                    cell.appendChild(piece);
                }
            }
        }
    }
    
    // 创建烟花效果
    function createFireworks() {
        const fireworksCount = 20;
        const boardRect = board.getBoundingClientRect();
        const container = document.querySelector('.board-container');
        
        for (let i = 0; i < fireworksCount; i++) {
            setTimeout(() => {
                const firework = document.createElement('div');
                firework.classList.add('firework');
                
                // 随机位置
                const x = Math.random() * boardRect.width;
                const y = Math.random() * boardRect.height;
                
                firework.style.left = `${x}px`;
                firework.style.top = `${y}px`;
                
                // 随机颜色
                const hue = Math.floor(Math.random() * 360);
                const fireworkSize = 10 + Math.random() * 20;
                
                firework.style.width = `${fireworkSize}px`;
                firework.style.height = `${fireworkSize}px`;
                firework.style.background = `radial-gradient(circle, white, hsl(${hue}, 100%, 60%))`;
                firework.style.borderRadius = '50%';
                firework.style.boxShadow = `0 0 10px 2px hsl(${hue}, 100%, 70%)`;
                
                // 爆炸动画
                firework.style.animation = `firework-explosion 1s ease-out forwards`;
                firework.style.opacity = '0';
                
                container.appendChild(firework);
                
                // 一秒后移除烟花元素
                setTimeout(() => {
                    firework.remove();
                }, 1000);
            }, i * 200); // 每隔200ms添加一个烟花
        }
    }
    
    // 添加CSS动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes firework-explosion {
            0% {
                transform: scale(0.1);
                opacity: 0;
            }
            50% {
                opacity: 1;
            }
            100% {
                transform: scale(1.5);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}); 