const S3og = require('../lib/s3og')
// opts = {cleanup, onStop, onDead}
S3og.exitHandler()
const Nats = require('nats')

async function pingpong (nats) {
  const pingpongService = new S3og(
    'pingpong', {
      defaultRequestTimeout: 1000
    }
  )
  const TEST_GROUP = 'test.group'
  const controllers = S3og.readControllersFromDir({
    path: './',
    mask: /test.pingpong.*/,
    group: TEST_GROUP
  })
  controllers.forEach(c => pingpongService.use(c))
  // pingpongService.on('TASK', task => console.log(task))
  // pingpongService.on('TASK_END', taskResult => console.log(taskResult))
  pingpongService.on('STOP', reason => console.log(`${pingpongService.name} stop:`, reason))
  console.log('start', new Date())
  const ether = pingpongService.go(nats)
  console.log(pingpongService.controllers)
  console.log(await ether.ask('test.pingpong.ping', { message: 'ping' }))
}

async function sink (nats) {
  const sinkService = new S3og('sink')
  // all controllers runned in same process. just for a demonstration
  for (let i in [1, 2]) {
    console.log('producer', i)
    sinkService.use({
      subject: 'test.sink.producer',
      handler: require('./test.sink.producer')
    })
  }
  // sinkService.on('TASK', task => console.log(task))
  // sinkService.on('TASK_END', taskResult => console.log(taskResult))
  sinkService.on('STOP', reason => console.log(`${sinkService.name} stop:`, reason))
  console.log('start', new Date())
  const ether = sinkService.go(nats)
  console.log(sinkService.controllers)
  console.log('must be only 1 random values:', await ether.sink('test.sink.producer', null, 1000, 1))
  console.log('must be 2 random values:', await ether.sink('test.sink.producer', null, 1000, 99))
  console.log('must be 0 random values:', await ether.sink('test.sink.producer', null, 1, 99))
  console.log('must be 2 errors:', await ether.sink('test.sink.producer', { beBad: true }, 1000, 1))
  sinkService.stop('task end')
}

const nats = Nats.connect({
  url: 'nats://gnatsd.local:4222',
  maxReconnectAttempts: 20,
  reconnectTimeWait: 500,
  json: true
})
nats.on('connect', () => {
  S3og.exitHandler({
    cleanup: () => nats.close(),
    onStop: event => console.log('app stop:', event),
    onDead: error => console.log('app dead:', error)
  })
  pingpong(nats)
  .then(() => sink(nats))
  .then(() => process.exit())
  .catch(e => process.exit(e))
})
