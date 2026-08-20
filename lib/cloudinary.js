const crypto = require('crypto');

function configured(config) { return Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret); }
async function upload(file, config) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1').update(`timestamp=${timestamp}${config.cloudinaryApiSecret}`).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  form.append('api_key', config.cloudinaryApiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/image/upload`, { method: 'POST', body: form });
  const body = await response.json();
  if (!response.ok || !body.secure_url) throw new Error('Image storage provider rejected upload');
  return body.secure_url;
}
module.exports = { configured, upload };
