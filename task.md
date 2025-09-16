
## 1. Cấu trúc thư mục lưu trữ audio tracks riêng biệt

```
recordings/
├── meeting_<meeting_id>_<timestamp>/
│   ├── mixed_audio.wav                  # Audio đã trộn (tương tự hiện tại)
│   ├── participants/
│   │   ├── <display_name>_<participant_id>/
│   │   │   ├── info.json                 # Metadata về người nói
│   │   │   ├── activity.log              # Log hoạt động của người nói
│   │   │   ├── audio_tracks/
│   │   │   │   ├── track_<display_name>_<participant_id>_<track_id>_<timestamp>.wav
│   │   │   │   └── track_<display_name>_<participant_id>_<track_id>_<timestamp>.wav
│   │   │   └── combined_<display_name>_<participant_id>.wav  # Audio kết hợp từ tất cả tracks
│   │   └── participants_summary.json    # Tổng hợp thông tin tất cả người nói
│   └── meeting_metadata.json            # Metadata về cuộc họp
```

## 2. Thiết kế hệ thống lưu trữ với metadata

### 2.1. Metadata cho từng participant (info.json)
```json
{
  "participant_id": "user123",
  "device_id": "spaces/123",
  "display_name": "Nguyen Van A",
  "full_name": "Nguyen Van A",
  "join_time": "2023-06-15T10:30:00Z",
  "leave_time": "2023-06-15T11:30:00Z",
  "total_speaking_time": 120000,
  "tracks": [
    {
      "track_id": "track456",
      "stream_id": "stream789",
      "start_time": "2023-06-15T10:30:05Z",
      "end_time": "2023-06-15T10:35:00Z",
      "duration": 295000
    }
  ]
}
```

### 2.2 Metadata cho meeting (meeting_metadata.json)
```json
{
  "meeting_id": "meeting_abc123",
  "meeting_url": "https://meet.google.com/abc-defg-hij",
  "start_time": "2023-06-15T10:30:00Z",
  "end_time": "2023-06-15T11:30:00Z",
  "participants": [
    {
      "participant_id": "user123",
      "display_name": "Nguyen Van A",
      "join_time": "2023-06-15T10:30:00Z",
      "leave_time": "2023-06-15T11:30:00Z"
    }
  ]
}
```

## 3. Cơ chế ghi file audio riêng biệt

### 3.1. Tạo luồng ghi file riêng biệt cho từng participant
- Tạo Map để lưu trữ write stream cho từng participant (theo deviceId)
- Tự động tạo thư mục và file khi có audio từ một participant mới

### 3.2. Đặt tên file/thư mục dễ nhận biết
- Dùng tên người nói trong tên thư mục và tên file
- Sanitize tên để đảm bảo tương thích với hệ thống file

### 3.3. Tự động tạo file combined
- Tự động tạo file audio kết hợp từ tất cả các track của một người
- Giúp dễ dàng nghe toàn bộ nội dung của từng người nói

## 4. Tạo json file để có thông tin combine tracks theo thứ tự diễn ra cuộc trò chuyện để dễ xử lý sumarize 
```json
{
  "meeting_id": "meeting_abc123",
  "meeting_url": "https://meet.google.com/abc-defg-hij",
  "participants": [
    {
      "participant_id": "user123",
      "display_name": "Nguyen Van A",
      "join_time": "2023-06-15T10:30:00Z",
      "leave_time": "2023-06-15T11:30:00Z"
    }
  ],
  "timeline": [
    {
      "participant_id": "user123",
      "display_name": "Nguyen Van A",
      "start_speaking": "2023-06-15T10:30:00Z",
      "stop_speaking": "2023-06-15T11:30:00Z",
      "audio_tracks": [
        {
          "path": "recordings/track_1",
          "timestamp": "2023-06-15T10:30:00Z",
        }
      ]
    }
  ]
}
```