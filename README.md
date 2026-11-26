# ricochetink.com

Ricochet Ink oyununun tek sayfalık web sitesi. GitHub Pages üzerinden yayınlanır; derleme adımı yoktur.

```
index.html     Sayfa (TR / EN metinler data-l ile, dil tarayıcıdan seçilir)
style.css      Stiller
game.js        Canvas'ta oynayan küçük oyun sahneleri (hero + üç kural)
assets/        Oxanium fontu, uygulama simgesi, paylaşım görseli
CNAME          Özel alan adı: ricochetink.com
```

## Yerelde açma

Herhangi bir statik sunucu yeter, örneğin:

```bash
npx serve .
```

## Yayın öncesi doldurulacaklar

- `index.html` içindeki `[COMPANY NAME]` / `[ŞİRKET ADI]` ve `[EMAIL]` / `[E-POSTA]`
- Mağaza bağlantıları: `#download` bölümündeki `.store` bağlantılarının `href`'i, sonra `aria-disabled` ve "Yakında" metni kaldırılır

## Alan adı (DNS)

Alan adı sağlayıcısında:

| Tür | Ad | Değer |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | r00twr3nch.github.io |

DNS yayıldıktan sonra repo ayarlarında *Pages → Enforce HTTPS* açılır.

## Oyun sahneleri

Sahneler `game.js` içindeki `SCENES` nesnesinde tanımlıdır. Atış açıları sabittir (`deg`).
Bir sahneyi değiştirirseniz o atışın `deg` değerini silin, sayfayı açıp konsolda
`RicochetInk.check()` çalıştırın; çözücünün bulduğu açıyı `deg` olarak geri yazın.
