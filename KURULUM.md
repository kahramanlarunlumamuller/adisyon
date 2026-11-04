# Adisyon Takip — Kurulum Rehberi

Toplam süre: yaklaşık 30–45 dakika. Bilgisayara program kurmanız gerekmez, hepsi tarayıcıdan yapılır.

## Dosyalar

| Dosya                               | Ne işe yarar                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `index.html`, `style.css`, `app.js` | Uygulamanın kendisi                                                            |
| `firebase-config.js`                | Firebase bağlantı bilgileri (Adım 5'te dolduracaksınız)                        |
| `manifest.json`, `sw.js`, `icons/`  | Telefonda uygulama gibi açılması ve internetsiz çalışması için                 |
| `firestore.rules`                   | Güvenlik kuralları (Firebase'e yapıştırılacak, GitHub'a yüklenmesi şart değil) |

---

## Adım 1 — Google hesabı

Bu iş için yeni bir Gmail hesabı açın (ör. ``). Firebase ve GitHub'ı bu hesapla açacaksınız. Müşteriye teslim ederken hesabın şifresini de verebilir ya da kendinizde tutabilirsiniz.

## Adım 2 — Firebase projesi

1. https://console.firebase.google.com adresine yeni hesapla girin.
2. **Proje oluştur** → ad verin (ör. `kahramanlar-adisyon`) → Google Analytics'i **kapatın** → Oluştur.
3. Ücretsiz plan (Spark) yeterlidir, kredi kartı istemez.

## Adım 3 — Giriş sistemi (Authentication)

1. Sol menü → **Build → Authentication** → **Get started**.
2. **Sign-in method** sekmesi → **Email/Password** → ilk anahtarı açın → Kaydet.
3. **Users** sekmesi → **Add user** → uygulamayı kullanacak kişinin e-postası ve şifresi.
   (Örnek: fırın sahibi için bir kullanıcı, kendiniz için bir kullanıcı.)

## Adım 4 — Veritabanı (Firestore)

1. Sol menü → **Build → Firestore Database** → **Create database**.
2. Konum: `eur3 (europe-west)` → **Production mode** ile başlatın.
3. **Rules** sekmesine geçin, içindekini silin, `firestore.rules` dosyasının içeriğini yapıştırın.
4. `'ORNEK@gmail.com'` yazan yere Adım 3'te açtığınız e-postaları yazın:
   ```
   && request.auth.token.email in [
     'firin@gmail.com',
     'sizin@gmail.com'
   ];
   ```
   E-postaları **küçük harfle** yazın, aralarına virgül koyun.
5. **Publish (Yayınla)**.

> Bu liste uygulamanın kilididir. Listede olmayan biri giriş yapsa bile hiçbir veriyi göremez.

## Adım 5 — Bağlantı bilgilerini almak

1. Sol üstte ⚙ → **Project settings** → **General**.
2. Aşağıda "Your apps" → **</>** (Web) simgesi → takma ad yazın (ör. `adisyon-web`) → Hosting kutusunu **işaretlemeyin** → Register app.
3. Ekranda çıkan `firebaseConfig = { ... }` bilgilerini kopyalayın.
4. `firebase-config.js` dosyasını Not Defteri ile açın, örnek değerlerin yerine kendi değerlerinizi yapıştırın, kaydedin.

> Bu bilgilerin GitHub'da herkese açık durması sorun değildir; güvenliği Adım 4'teki kurallar sağlar.

## Adım 6 — GitHub'a yükleme ve yayınlama

1. https://github.com adresinde aynı Gmail ile hesap açın (kullanıcı adı ör. `kahramanlar-adisyon`).
2. Sağ üst **+** → **New repository** → ad: `adisyon` → **Public** → Create.
   (Ücretsiz GitHub Pages için depo herkese açık olmalıdır. Verileriniz GitHub'da değil Firebase'de durur, kodun görünmesi sorun değildir.)
3. Açılan sayfada **uploading an existing file** bağlantısına tıklayın.
4. Klasördeki tüm dosyaları **ve `icons` klasörünü** sürükleyip bırakın → **Commit changes**.
   `index.html` deponun **en üst** seviyesinde olmalı, bir alt klasörün içinde değil.
5. Depoda **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, klasör **/(root)** → Save.
6. 1–2 dakika sonra sayfanın üstünde adres çıkar:
   `https://KULLANICIADI.github.io/adisyon/`

## Adım 7 — Firebase'e bu adresi tanıtmak

1. Firebase → **Authentication → Settings → Authorized domains** → **Add domain**.
2. `KULLANICIADI.github.io` yazın (sadece alan adı, `https://` ve `/adisyon` olmadan) → Add.

Bunu yapmazsanız giriş ekranı hata verir.

## Adım 8 — İlk kullanım

1. Adresi telefonda açın, Adım 3'teki e-posta ve şifreyle giriş yapın.
2. **Ayarlar** sekmesi:
   - İşletme adını yazın (PDF ve Excel başlığında görünür).
   - **Varsayılan 8 ürünü ekle**'ye dokunun, fiyatlarını girin. Yeni ürün ekleyebilir, sırasını değiştirebilir, satmadığınız ürünün "Aktif" işaretini kaldırabilirsiniz.
   - Otelleri ekleyin. Bir otelin fiyatı farklıysa otelin yanındaki **Fiyatlar**'a dokunup sadece farklı olan ürünlerin fiyatını yazın.
3. **Yeni fiş**: otel, tarih, fiş no, adetler → Kaydet. Fiş no bir sonraki fiş için otomatik artar.
4. **Özet**: ay ve otel seçin → toplamlar ve tutar hazır. **PDF / Yazdır** veya **Excel indir**.

## Adım 9 — Telefona uygulama olarak eklemek

- **iPhone:** Safari ile açın → alttaki **Paylaş** (kare ve ok) → **Ana Ekrana Ekle**.
- **Android:** Chrome ile açın → sağ üst ⋮ → **Ana ekrana ekle** / **Uygulamayı yükle**.

Ana ekranda simit simgeli "Adisyon" uygulaması çıkar. İnternet yokken de fiş girilebilir; listede "gönderilmedi" yazar, internet gelince kendiliğinden kaydedilir.

---

## Güncelleme yapmak

1. Değişen dosyayı GitHub'da depoya tekrar yükleyin (aynı adla yükleyince üzerine yazar).
2. `sw.js` dosyasının ilk satırındaki sürüm numarasını artırın: `adisyon-v1` → `adisyon-v2`. Bunu yapmazsanız telefonlar eski sürümü bir süre daha gösterebilir.
3. Telefonlarda uygulamayı kapatıp açmak yeterlidir.

## Yeni kullanıcı eklemek

1. Firebase → Authentication → Users → Add user.
2. Firestore → Rules → e-postayı listeye ekleyin → Publish.

## Sorun giderme

| Sorun                                | Çözüm                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| "Kurulum tamamlanmamış" yazıyor      | `firebase-config.js` doldurulmamış (Adım 5)                               |
| Girişte "unauthorized-domain" hatası | Adım 7 yapılmamış                                                         |
| "Bu hesabın yetkisi yok"             | E-posta Firestore kurallarındaki listede yok veya büyük harf var (Adım 4) |
| GitHub adresi 404 veriyor            | `index.html` alt klasörde kalmış ya da Pages ayarı birkaç dakika bekliyor |
| Değişiklik telefonda görünmüyor      | `sw.js` sürüm numarasını artırın, uygulamayı kapatıp açın                 |
| Tutarlar 0 görünüyor                 | Ayarlar'dan ürün fiyatlarını girin                                        |

## Maliyet

Firebase ücretsiz planı günde 50.000 okuma ve 20.000 yazma işlemine izin verir. Birkaç otel ve günde onlarca fiş için bu sınıra yaklaşılmaz. GitHub Pages ücretsizdir.
