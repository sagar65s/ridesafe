import webpush from 'web-push'
const {publicKey,privateKey}=webpush.generateVAPIDKeys()
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${publicKey}"\nVAPID_PRIVATE_KEY="${privateKey}"`)
console.log('Keep the private key on the server. Set both keys before building; do not regenerate on every deploy.')
