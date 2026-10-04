const app = require('./app');
const { otomatikYedeklemeyiBaslat } = require('./yedek');

const PORT = process.env.PORT || 3000;

otomatikYedeklemeyiBaslat();

app.listen(PORT, () => {
  console.log(`Eczam Programi ${PORT} portunda calisiyor`);
});
