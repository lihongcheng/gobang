from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'gobang_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# 存储房间信息
rooms = {}

@app.route('/')
def index():
    """首页，创建新房间"""
    return render_template('index.html')

@app.route('/<room_id>')
def room(room_id):
    """进入指定房间"""
    # 如果房间不存在则创建
    if room_id not in rooms:
        rooms[room_id] = {
            'players': [],
            'viewers': [],
            'board': [[None for _ in range(14)] for _ in range(14)],
            'current_turn': 'black',  # 黑棋先行
            'moves': [],  # 记录所有的移动，用于悔棋
            'game_over': False,
            'winner': None
        }
    
    return render_template('game.html', room_id=room_id)

@socketio.on('join')
def on_join(data):
    """处理玩家加入房间"""
    room_id = data['room']
    device_id = data['device_id']
    join_room(room_id)
    
    # 确保房间存在
    if room_id not in rooms:
        rooms[room_id] = {
            'players': [],
            'viewers': [],
            'board': [[None for _ in range(14)] for _ in range(14)],
            'current_turn': 'black',
            'moves': [],
            'game_over': False,
            'winner': None
        }
    
    # 检查设备是否已经在房间中
    if device_id in [player['id'] for player in rooms[room_id]['players']] or device_id in rooms[room_id]['viewers']:
        player_type = 'player' if device_id in [player['id'] for player in rooms[room_id]['players']] else 'viewer'
        player_info = next((player for player in rooms[room_id]['players'] if player['id'] == device_id), None)
        if player_info:
            emit('join_response', {
                'status': 'reconnected',
                'player_type': player_type,
                'color': player_info.get('color', None),
                'room_data': rooms[room_id]
            })
        else:
            emit('join_response', {
                'status': 'reconnected',
                'player_type': player_type,
                'color': None,
                'room_data': rooms[room_id]
            })
    else:
        # 新设备加入房间
        if len(rooms[room_id]['players']) < 2:
            # 确定玩家颜色
            if len(rooms[room_id]['players']) == 0:
                color = 'black' if random.random() > 0.5 else 'white'
            else:
                color = 'white' if rooms[room_id]['players'][0]['color'] == 'black' else 'black'
            
            # 添加到玩家列表
            rooms[room_id]['players'].append({
                'id': device_id,
                'color': color
            })
            
            emit('join_response', {
                'status': 'joined',
                'player_type': 'player',
                'color': color,
                'room_data': rooms[room_id]
            })
        else:
            # 添加到观众列表
            rooms[room_id]['viewers'].append(device_id)
            emit('join_response', {
                'status': 'joined',
                'player_type': 'viewer',
                'room_data': rooms[room_id]
            })
    
    # 通知房间内所有人有新成员加入
    emit('room_update', rooms[room_id], to=room_id)

@socketio.on('make_move')
def on_move(data):
    """处理玩家落子"""
    room_id = data['room']
    device_id = data['device_id']
    row = data['row']
    col = data['col']
    
    # 检查是否是该玩家的回合
    player = next((p for p in rooms[room_id]['players'] if p['id'] == device_id), None)
    if not player or player['color'] != rooms[room_id]['current_turn'] or rooms[room_id]['game_over']:
        return
    
    # 检查位置是否有效
    if row < 0 or row >= 14 or col < 0 or col >= 14 or rooms[room_id]['board'][row][col] is not None:
        return
    
    # 更新棋盘
    rooms[room_id]['board'][row][col] = player['color']
    
    # 记录这一步棋
    move = {
        'row': row,
        'col': col,
        'color': player['color']
    }
    rooms[room_id]['moves'].append(move)
    
    # 检查胜利条件
    if check_win(rooms[room_id]['board'], row, col, player['color']):
        rooms[room_id]['game_over'] = True
        rooms[room_id]['winner'] = player['color']
        emit('game_over', {'winner': player['color']}, to=room_id)
    else:
        # 切换回合
        rooms[room_id]['current_turn'] = 'white' if player['color'] == 'black' else 'black'
        
    # 通知房间内所有人游戏状态更新
    emit('game_update', rooms[room_id], to=room_id)

@socketio.on('request_undo')
def on_request_undo(data):
    """处理悔棋请求"""
    room_id = data['room']
    device_id = data['device_id']
    
    # 检查是否是该玩家的回合
    player = next((p for p in rooms[room_id]['players'] if p['id'] == device_id), None)
    if not player or player['color'] == rooms[room_id]['current_turn'] or rooms[room_id]['game_over']:
        return
    
    # 获取对手
    opponent = next((p for p in rooms[room_id]['players'] if p['id'] != device_id), None)
    if opponent:
        emit('undo_request', {'from_id': device_id}, to=room_id)

@socketio.on('undo_response')
def on_undo_response(data):
    """处理悔棋响应"""
    room_id = data['room']
    accepted = data['accepted']
    
    if accepted and len(rooms[room_id]['moves']) > 0:
        # 删除最后一步
        last_move = rooms[room_id]['moves'].pop()
        row, col = last_move['row'], last_move['col']
        rooms[room_id]['board'][row][col] = None
        
        # 切换回合
        rooms[room_id]['current_turn'] = last_move['color']
        
        # 重置游戏结束状态
        rooms[room_id]['game_over'] = False
        rooms[room_id]['winner'] = None
        
        # 通知房间内所有人游戏状态更新
        emit('game_update', rooms[room_id], to=room_id)
        emit('undo_accepted', {}, to=room_id)
    else:
        emit('undo_rejected', {}, to=room_id)

@socketio.on('restart_game')
def on_restart(data):
    """重新开始游戏"""
    room_id = data['room']
    
    if room_id in rooms:
        # 重置游戏状态
        rooms[room_id]['board'] = [[None for _ in range(14)] for _ in range(14)]
        rooms[room_id]['moves'] = []
        rooms[room_id]['game_over'] = False
        rooms[room_id]['winner'] = None
        
        # 切换先手顺序
        if len(rooms[room_id]['players']) == 2:
            # 交换玩家颜色
            rooms[room_id]['players'][0]['color'], rooms[room_id]['players'][1]['color'] = \
                rooms[room_id]['players'][1]['color'], rooms[room_id]['players'][0]['color']
            
        # 设置当前回合为黑棋
        rooms[room_id]['current_turn'] = 'black'
        
        # 通知房间内所有人游戏重新开始
        emit('game_restart', rooms[room_id], to=room_id)

def check_win(board, row, col, color):
    """检查是否有玩家获胜"""
    directions = [
        [(0, 1), (0, -1)],  # 水平
        [(1, 0), (-1, 0)],  # 垂直
        [(1, 1), (-1, -1)], # 对角线
        [(1, -1), (-1, 1)]  # 反对角线
    ]
    
    for dir_pair in directions:
        count = 1  # 当前位置已经有一个
        
        # 检查每个方向对
        for direction in dir_pair:
            dr, dc = direction
            r, c = row + dr, col + dc
            
            # 沿着方向计数连续的棋子
            while 0 <= r < 14 and 0 <= c < 14 and board[r][c] == color:
                count += 1
                r += dr
                c += dc
        
        # 如果有5个或更多连续的棋子，则获胜
        if count >= 5:
            return True
    
    return False

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True) 