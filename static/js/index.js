document.addEventListener('DOMContentLoaded', function() {
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const roomIdInput = document.getElementById('roomIdInput');
    
    // 创建新房间
    createRoomBtn.addEventListener('click', function() {
        // 生成随机房间ID
        const roomId = generateRoomId();
        redirectToRoom(roomId);
    });
    
    // 加入已有房间
    joinRoomBtn.addEventListener('click', function() {
        const roomId = roomIdInput.value.trim();
        if (roomId) {
            redirectToRoom(roomId);
        } else {
            alert('请输入房间ID');
        }
    });
    
    // 按回车键加入房间
    roomIdInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinRoomBtn.click();
        }
    });
    
    // 生成随机房间ID
    function generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    // 重定向到游戏房间
    function redirectToRoom(roomId) {
        window.location.href = '/' + roomId;
    }
}); 