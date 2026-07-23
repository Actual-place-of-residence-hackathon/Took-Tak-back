const multer = require('multer');
const path = require('path');

// 지금은 로컬 디스크 저장. 배포 시에는 S3 등 오브젝트 스토리지로 교체 권장.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// 신고 사진은 최대 3장
const uploadReportImages = upload.array('images', 3);

// 조치 후 사진은 1장
const uploadActionImage = upload.single('action_image');

module.exports = { uploadReportImages, uploadActionImage };
