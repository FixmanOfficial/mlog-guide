/**
 * Значение переменной процессора.
 *
 * Перенос logic/LVar.java. Переменная в любой момент — либо число, либо объект; флаг isobj
 * говорит, что именно. Тонкости, которые легко потерять:
 *
 *  - переменная по умолчанию не 0, а объект null (LAssembler.putVar);
 *  - NaN и бесконечность в переменной не хранятся: setnum превращает их в объект null;
 *  - порог истинности bool() равен 1e-5, а не 1e-6, как эпсилон сравнения в op и jump;
 *  - set(other) копирует значение мимо проверки на константу — проверку делает инструкция.
 */

/** LVar.invalid: NaN и бесконечности хранению не подлежат. */
export const invalid = (value) => Number.isNaN(value) || !Number.isFinite(value)

export class LVar {
    constructor(name, {constant = false} = {}) {
        this.name = name
        this.constant = constant

        // Переменные по умолчанию — объекты null, а не нули. LAssembler.putVar
        this.isobj = true
        this.objval = null
        this.numval = 0
    }

    /** Числовое значение. Объект даёт 1, null-объект — 0, недопустимое число — 0. */
    num() {
        if (this.isobj) return this.objval !== null ? 1 : 0
        return invalid(this.numval) ? 0 : this.numval
    }

    /** LVar.numi: приведение к int усекает к нулю и упирается в границы 32 бит. */
    numi() {
        const value = Math.trunc(this.num())
        if (value > 2147483647) return 2147483647
        if (value < -2147483648) return -2147483648
        return value
    }

    /** То же, но null-объект даёт NaN: часть инструкций различает «нет значения» и ноль. */
    numOrNan() {
        if (this.isobj) return this.objval !== null ? 1 : NaN
        return invalid(this.numval) ? 0 : this.numval
    }

    obj() {
        return this.isobj ? this.objval : null
    }

    /** Порог 1e-5, не 1e-6. LVar.bool() */
    bool() {
        return this.isobj ? this.objval !== null : Math.abs(this.numval) >= 0.00001
    }

    setnum(value) {
        if (this.constant) return

        if (invalid(value)) {
            // NaN и бесконечность превращаются в объект null, а не сохраняются как числа
            this.objval = null
            this.isobj = true
        } else {
            this.numval = value
            this.objval = null
            this.isobj = false
        }
    }

    setobj(value) {
        if (this.constant) return
        this.objval = value
        this.isobj = true
    }

    setbool(value) {
        this.setnum(value ? 1 : 0)
    }

    /** Присвоение значения константе здесь не блокируется — так же, как в LVar.set. */
    set(other) {
        this.isobj = other.isobj

        if (other.isobj) {
            this.objval = other.objval
        } else {
            this.numval = invalid(other.numval) ? 0 : other.numval
        }
    }

    toString() {
        const value = this.isobj ? this.objval : this.numval
        return `${this.name}: ${value}${this.constant ? ' [const]' : ''}`
    }
}
