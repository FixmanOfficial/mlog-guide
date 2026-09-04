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
    withParams('drawflush', {target: 'display1'}),
    withParams('jump', {destIndex: '0', op: 'lessThan', value: 'level', compare: '100'}),
    withParams('end', {})
]

function withParams(opcode, params) {
    const statement = createStatement(opcode)
    return {...statement, params: {...statement.params, ...params}}
}

function Stand() {
    const [text, setText] = useState(toText(initial))

    return (
        <div class="stand">
            <div>
                <h1>Редактор</h1>
                <Editor initial={initial} onChange={setText} />
            </div>
            <div>
                <h1>Текст mlog</h1>
                <div class="stand__out">{text}</div>
            </div>
        </div>
    )
}

render(<Stand />, document.getElementById('app'))
