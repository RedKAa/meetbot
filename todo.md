## [x] Pharse 0: Simple Reactjs WebUI
## [x] Pharse 1: Intergrate with deepgram API for transcription and summary

## [ ] Pharse 3: Update WebUI to show meeting summary

1. [ ] Hủy mục nhập tên bot, mặc định là HopFast đặt trong .env
2. [ ] Thêm mục nhập tên cuộc họp để lưu trữ, tiện quản lí các cuộc họp
3. [ ] Mỗi participant hãy tạo file transcription, summary tương ứng với file .wav
4. [ ] mixed_audio.wav.json đổi tên thành meeting-summary.json khi lưu, đặt chung level với mixed_audio.wav
5. [ ] Lưu thêm thông tin fullName của participant trong session-summary.json
6. [ ] Tổ chức thông tin cuộc họp trên WEB UI hợp lí hơn để xem đc audio, transcription, summary theo từng participant và theo cả cuộc họp, nhớ hiển thị thời gian cuộc họp và fullName của participant
7. [ ] Load transcription và summary lên front-end UI
8. [ ] double check logic get summary có vẻ nội dung đang bị lặp lại thêm 1 lần

## [ ] Pharse 4: Use React Lib MCP to make better UI