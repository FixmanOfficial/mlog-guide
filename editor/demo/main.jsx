/** Стенд редактора: слева блоки, справа собранный текст mlog. Только для разработки. */

import {render} from 'preact'
import {useState} from 'preact/hooks'

import {Editor} from '../src/Editor.jsx'
import {createStatement, toText} from '../src/program.js'
import '../src/styles.css'

const initial = [
    withParams('set', {to: 'level', from: '63'}),
    withParams('op', {op: 'mul', dest: 'width', a: 'level', b: '1.76'}),
    withParams('write', {input: 'level', target: 'cell1', address: '0'}),
    withParams('print', {value: '"Заряд: {0}%"'}),
    withParams('format', {value: 'level'}),
    withParams('printflush', {target: 'message1'}),
    withParams('draw', {type: 'rect', x: '0', y: '72', p1: 'width', p2: '32'}),
    withParams('sensor', {to: 'заряд', type: '@copper', from: 'cell1'}),
    withParams('drawflush', {target: 'display1'}),
    withParams('control', {type: 'enabled', target: 'switch1', p1: '1'}),
    withParams('control', {type: 'shoot', target: 'turret1', p1: '10', p2: '20', p3: '1'}),
    withParams('jump', {op: 'greaterThan', value: 'level', compare: '50'}),
    withParams('jump', {op: 'lessThan', value: 'level', compare: '100'}),
    withParams('end', {})
]

function withParams(opcode, params) {
    const statement = createStatement(opcode)
    return {...statement, params: {...statement.params, ...params}}
}

// Цели переходов задаются ссылками, а не номерами: вставка строки выше цели их не ломает
const jumps = initial.filter(statement => statement.opcode === 'jump')
jumps[0].target = initial[4].id
jumps[1].target = initial[0].id

function Stand() {
    const [text, setText] = useState(toText(initial))

    // В игре кнопка добавления живёт в нижнем ряду окна процессора, а не в полотне.
    // Стенд окна не рисует, поэтому кнопка своя
    const [adding, setAdding] = useState(false)

    return (
        <div class="stand">
            <div>
                <h1>Редактор</h1>
                <button class="game-button stand__add" onClick={() => setAdding(true)}>
                    Добавить
                </button>
                <Editor
                    initial={initial}
                    onChange={setText}
                    addOpen={adding}
                    onAddClose={() => setAdding(false)}
                />
            </div>
            <div>
                <h1>Текст mlog</h1>
                <div class="stand__out">{text}</div>
            </div>
        </div>
    )
}

render(<Stand />, document.getElementById('app'))
