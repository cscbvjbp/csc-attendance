# CSC Bal Vidyalaya स्टाफ अटेंडेंस वेबसाइट: सेटअप गाइड

यह वेबसाइट GitHub Pages पर चलती है और डेटा Firebase (Google की मुफ़्त सेवा) में रखती है।
पूरा सेटअप एक बार करना है। लगभग 30 से 40 मिनट लगेंगे। किसी कोडिंग की ज़रूरत नहीं है।

इस फ़ोल्डर की फ़ाइलें:

- `index.html`, `app.js`, `style.css`, `logo.jpg`, `manifest.webmanifest`, `icons/` : वेबसाइट
- `config.js` : इसमें आपको Firebase की जानकारी भरनी है (चरण 6)
- `firestore.rules` : डेटा की सुरक्षा के नियम (चरण 5)

---

## चरण 1: Firebase प्रोजेक्ट बनाएँ

1. https://console.firebase.google.com खोलें और अपने Google अकाउंट से साइन इन करें।
2. **Create a project** (या **Add project**) दबाएँ।
3. नाम लिखें, जैसे `csc-attendance`, और **Continue** दबाएँ।
4. Google Analytics बंद कर दें (ज़रूरी नहीं है), फिर **Create project** दबाएँ।

## चरण 2: लॉगिन चालू करें

1. बाईं तरफ़ **Build** > **Authentication** खोलें और **Get started** दबाएँ।
2. **Sign-in method** टैब में **Email/Password** चुनें, पहला स्विच (Enable) चालू करें और **Save** दबाएँ।
   (दूसरा स्विच "Email link" चालू करने की ज़रूरत नहीं है।)
3. **Settings** टैब > **User actions** में देख लें कि **Enable create (sign-up)** चालू है। यह चालू रहना चाहिए, वरना एडमिन स्टाफ नहीं जोड़ पाएगा।

## चरण 3: एडमिन का लॉगिन बनाएँ

1. **Authentication** > **Users** टैब > **Add user** दबाएँ।
2. Email में ठीक यही लिखें: `admin@cscbalvidyalaya.app`
3. Password में अपना पासवर्ड रखें (कम से कम 6 अक्षर) और **Add user** दबाएँ।

वेबसाइट में एडमिन लॉगिन करते समय **Admin ID** में `admin` और यही पासवर्ड डालना है।

## चरण 4: डेटाबेस बनाएँ

1. **Build** > **Firestore Database** > **Create database** दबाएँ।
2. Location में `asia-south1 (Mumbai)` चुनें और **Next** दबाएँ।
3. **Start in production mode** चुनें और **Create** दबाएँ।

## चरण 5: सुरक्षा नियम लगाएँ (बहुत ज़रूरी)

1. Firestore Database में **Rules** टैब खोलें।
2. वहाँ जो लिखा है उसे पूरा मिटा दें।
3. इस फ़ोल्डर की `firestore.rules` फ़ाइल को खोलकर उसका पूरा लिखा हुआ यहाँ चिपका दें।
4. **Publish** दबाएँ।

इन नियमों के बिना डेटा सुरक्षित नहीं रहेगा।

## चरण 6: वेबसाइट को Firebase से जोड़ें

1. Firebase में ऊपर बाईं तरफ़ **Project Overview** के पास गियर आइकन > **Project settings** खोलें।
2. नीचे **Your apps** में **`</>`** (Web) आइकन दबाएँ।
3. नाम लिखें, जैसे `attendance-web`। **Firebase Hosting** वाला बॉक्स चुनने की ज़रूरत नहीं है। **Register app** दबाएँ।
4. जो `firebaseConfig` दिखे, उसमें `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` की कीमतें हैं।
5. इस फ़ोल्डर की `config.js` खोलें (Notepad में चलेगा) और इन्हीं कीमतों को `config.js` में `firebaseConfig` के अंदर रखें। फ़ाइल के अंत में `window.CSC_CONFIG = { firebase: firebaseConfig };` भी होना चाहिए। कोटेशन `"` वैसे ही रहने दें। फिर फ़ाइल सेव करें।

## चरण 7: GitHub पर डालें

1. https://github.com पर अकाउंट बनाएँ या साइन इन करें।
2. ऊपर **+** > **New repository** दबाएँ। नाम `csc-attendance` लिखें, **Public** रखें और **Create repository** दबाएँ।
3. **uploading an existing file** पर दबाएँ।
4. इस फ़ोल्डर की सारी फ़ाइलें और `icons` फ़ोल्डर खींचकर डालें, यानी `index.html`, `app.js`, `config.js`, `style.css`, `logo.jpg`, `manifest.webmanifest` और `icons`। `SETUP-HINDI.md` और `firestore.rules` डालना ज़रूरी नहीं है। **Commit changes** दबाएँ।
5. Repository में **Settings** > **Pages** खोलें। **Source** में **Deploy from a branch** चुनें, Branch `main` और फ़ोल्डर `/ (root)` रखें और **Save** दबाएँ।
6. 1 से 2 मिनट बाद वहीं ऊपर आपकी वेबसाइट का पता दिखेगा, जैसे `https://आपका-यूज़रनेम.github.io/csc-attendance/`। यही लिंक स्टाफ को देना है।

## चरण 8: वेबसाइट का पता Firebase में जोड़ें

1. Firebase > **Authentication** > **Settings** > **Authorized domains** खोलें।
2. **Add domain** दबाएँ और `आपका-यूज़रनेम.github.io` लिखें (आगे `/csc-attendance` नहीं)।

## चरण 9: पहली बार इस्तेमाल करें

1. वेबसाइट खोलें। **Admin** टैब दबाएँ। Admin ID में `admin` और अपना पासवर्ड डालकर साइन इन करें।
2. **Staff** टैब में हर स्टाफ का नाम जोड़ें। हर स्टाफ को एक Staff ID और 6 अंकों का PIN मिलेगा। इसे उनके साथ साझा कर दें।
3. **QR & settings** टैब में या तो अपने QR की फोटो अपलोड करें या **Create a new QR for me** दबाएँ। फिर **Download poster** दबाकर पोस्टर प्रिंट करें और स्कूल के गेट पर लगाएँ।
4. वहीं स्कूल का समय, लेट की छूट और साप्ताहिक छुट्टी तय करें।
5. स्टाफ को वेबसाइट का लिंक भेजें। वे **Staff** टैब में अपनी ID और PIN से साइन इन करेंगे और **Scan QR with camera** दबाकर QR स्कैन करेंगे।

---

## ज़रूरी बातें

- **PIN 6 अंक का है**, क्योंकि Firebase में पासवर्ड कम से कम 6 अक्षर का होता है।
- **कैमरा:** स्कैन के लिए पहली बार ब्राउज़र कैमरा की अनुमति माँगेगा। उसे Allow करना होगा। GitHub Pages का पता `https` वाला है, इसलिए कैमरा चलेगा।
- **फ़ोन की होम स्क्रीन पर जोड़ना:** Chrome में तीन बिंदु > **Add to Home screen** दबाने पर यह ऐप की तरह खुलेगा।
- **स्कूल के बाहर से अटेंडेंस:** QR का मान सिर्फ़ एडमिन देख सकता है। स्टाफ को अटेंडेंस लगाने के लिए असली QR स्कैन करना पड़ता है, पर कोई स्कूल में लगे QR की फोटो खींचकर घर से भेजे, तो ऐप नहीं रोक पाएगा। इसके लिए लोकेशन की जाँच जोड़नी पड़ेगी, जो अभी नहीं जोड़ी है।
- **PIN रीसेट:** Staff टैब में "Reset PIN" दबाने पर नया PIN बनता है। पुराना अटेंडेंस रिकॉर्ड बना रहता है।
- **एडमिन का पासवर्ड बदलना:** "QR & settings" टैब में नीचे। भूल जाएँ तो Firebase > Authentication > Users में उस यूज़र के तीन बिंदु > **Reset password** से बदलें।
- **दूसरा एडमिन जोड़ना:** Firebase Authentication में नया यूज़र बनाएँ, जिसका ईमेल `कुछ@cscbalvidyalaya.app` हो। फिर `firestore.rules` में `isAdmin()` की सूची में वह ईमेल जोड़कर दोबारा Publish करें।
- **खर्च:** Firebase की मुफ़्त योजना (Spark) में रोज़ 50,000 पढ़ने और 20,000 लिखने की सीमा है। 30 से 50 स्टाफ के लिए यह काफ़ी है।
- **बदलाव करने पर:** GitHub में फ़ाइल दोबारा अपलोड करके Commit करें। 1 से 2 मिनट में वेबसाइट अपडेट हो जाती है।
- **Firebase की `apiKey`** वेबसाइट के कोड में दिखती है। यह सामान्य है, सुरक्षा चरण 5 के नियमों से होती है।
