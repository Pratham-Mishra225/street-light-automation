; ================================================================
; 8086-Based Ambient + Vehicle-Aware Street Light Automation
; Target: EMU8086 (.COM program)
;
; Inputs:
;   Ambient: 1 = Day, 2 = Dusk, 3 = Night
;   Vehicle: 0 = No vehicle, 1 = Vehicle detected
;   Position: 1..5 when vehicle is detected
;
; Lighting state per lamp:
;   0 = OFF
;   1 = DIM
;   2 = FULL
;
; Algorithm:
;   Day              -> all OFF
;   Dusk             -> all DIM
;   Night/no vehicle -> all DIM
;   Night/vehicle    -> vehicle zone (position +/- 1) FULL,
;                        remaining lamps DIM
;
; The program writes STATE.TXT so the React frontend can visualize
; the latest 8086 decision. EMU8086's DOS emulation supports file I/O.
; ================================================================

#make_com#
org 100h

jmp START

; ------------------------- DATA -------------------------
PROMPT_AMB      db 13,10,'Ambient condition:',13,10
                db '1. Day',13,10
                db '2. Dusk',13,10
                db '3. Night',13,10
                db '4. Exit',13,10
                db 'Enter choice: $'
PROMPT_VEH      db 13,10,'Vehicle detected? 0=No, 1=Yes: $'
PROMPT_POS      db 13,10,'Vehicle position (1-5): $'
INVALID         db 13,10,'Invalid input. Try again.',13,10,'$'
RESULT_MSG      db 13,10,'Decision written to STATE.TXT',13,10,'$'
NO_VEH_MSG      db 13,10,'Vehicle not detected.',13,10,'$'

FILE_NAME       db 'STATE.TXT',0
FILE_BUFFER     db 'AMBIENT=0',13,10
                db 'VEHICLE=0',13,10
                db 'POSITION=0',13,10
                db 'LIGHTS=00000',13,10
                db 'POWER=000',13,10
                db 'MODE=OFF',13,10
                db 'SEQ=0000',13,10
                db 'END',13,10
FILE_BUFFER_LEN equ $-FILE_BUFFER

LIGHTS          db 0,0,0,0,0
AMBIENT         db 0
VEHICLE         db 0
POSITION        db 0
POWER           dw 0
SEQ             dw 0
HANDLE          dw 0

; ------------------------- MAIN -------------------------
START:
    mov ax, cs
    mov ds, ax

MAIN_LOOP:
    lea dx, PROMPT_AMB
    mov ah, 09h
    int 21h

    mov ah, 01h
    int 21h
    sub al, '0'
    mov AMBIENT, al

    cmp al, 1
    jb BAD_AMBIENT
    cmp al, 4
    ja BAD_AMBIENT
    cmp al, 4
    je END_PROGRAM
    jmp READ_VEHICLE

BAD_AMBIENT:
    lea dx, INVALID
    mov ah, 09h
    int 21h
    jmp MAIN_LOOP

READ_VEHICLE:
    lea dx, PROMPT_VEH
    mov ah, 09h
    int 21h

    mov ah, 01h
    int 21h
    sub al, '0'
    mov VEHICLE, al

    cmp al, 0
    je DECIDE
    cmp al, 1
    je READ_POSITION

    lea dx, INVALID
    mov ah, 09h
    int 21h
    jmp MAIN_LOOP

READ_POSITION:
    lea dx, PROMPT_POS
    mov ah, 09h
    int 21h

    mov ah, 01h
    int 21h
    sub al, '0'
    mov POSITION, al

    cmp al, 1
    jb BAD_POSITION
    cmp al, 5
    ja BAD_POSITION
    jmp DECIDE

BAD_POSITION:
    lea dx, INVALID
    mov ah, 09h
    int 21h
    jmp MAIN_LOOP

; ------------------------- DECISION LOGIC -------------------------
DECIDE:
    ; Default every lamp to OFF.
    lea si, LIGHTS
    mov cx, 5
    xor al, al
CLEAR_LIGHTS:
    mov [si], al
    inc si
    loop CLEAR_LIGHTS

    ; DAY => OFF
    cmp AMBIENT, 1
    je CALCULATE

    ; DUSK => DIM
    mov al, 1
    lea si, LIGHTS
    mov cx, 5
FILL_DIM:
    mov [si], al
    inc si
    loop FILL_DIM

    ; NIGHT + no vehicle => DIM
    cmp AMBIENT, 3
    jne CALCULATE
    cmp VEHICLE, 1
    jne CALCULATE

    ; NIGHT + vehicle => current lamp and immediate neighbours FULL.
    ; Current lamp. Position 1..5 becomes array index 0..4.
    mov al, POSITION
    xor ah, ah
    dec ax
    lea si, LIGHTS
    add si, ax
    mov byte ptr [si], 2

    ; Left neighbour = position - 1, if it exists.
    mov al, POSITION
    cmp al, 1
    je SKIP_LEFT
    xor ah, ah
    dec ax
    dec ax
    lea si, LIGHTS
    add si, ax
    mov byte ptr [si], 2
SKIP_LEFT:

    ; Right neighbour = position + 1, if it exists.
    mov al, POSITION
    xor ah, ah
    cmp al, 5
    je SKIP_RIGHT
    inc ax
    dec ax
    lea si, LIGHTS
    add si, ax
    mov byte ptr [si], 2
SKIP_RIGHT:

CALCULATE:
    call CALC_POWER
    call BUILD_FILE_BUFFER
    call WRITE_STATE

    lea dx, RESULT_MSG
    mov ah, 09h
    int 21h

    cmp VEHICLE, 0
    jne MAIN_LOOP
    lea dx, NO_VEH_MSG
    mov ah, 09h
    int 21h
    jmp MAIN_LOOP

; ------------------------- POWER -------------------------
; OFF = 0 W, DIM = 20 W, FULL = 60 W per lamp.
CALC_POWER PROC
    push ax
    push bx
    push cx
    push si

    xor ax, ax
    lea si, LIGHTS
    mov cx, 5
POWER_LOOP:
    mov bl, [si]
    xor bh, bh
    cmp bl, 1
    je ADD_DIM
    cmp bl, 2
    je ADD_FULL
    jmp POWER_NEXT
ADD_DIM:
    add ax, 20
    jmp POWER_NEXT
ADD_FULL:
    add ax, 60
POWER_NEXT:
    inc si
    loop POWER_LOOP
    mov POWER, ax

    pop si
    pop cx
    pop bx
    pop ax
    ret
CALC_POWER ENDP

; ------------------------- BUFFER -------------------------
; Fills fixed-width fields in FILE_BUFFER.
BUILD_FILE_BUFFER PROC
    push ax
    push bx
    push cx
    push dx
    push si
    push di

    ; AMBIENT digit at offset 8.
    mov al, AMBIENT
    add al, '0'
    mov FILE_BUFFER+8, al

    ; VEHICLE digit at offset 21.
    mov al, VEHICLE
    add al, '0'
    mov FILE_BUFFER+19, al

    ; POSITION digit at offset 33.
    mov al, POSITION
    add al, '0'
    mov FILE_BUFFER+31, al

    ; LIGHTS digits begin at offset 43.
    lea si, LIGHTS
    lea di, FILE_BUFFER+41
    mov cx, 5
LIGHT_BUFFER_LOOP:
    mov al, [si]
    add al, '0'
    mov [di], al
    inc si
    inc di
    loop LIGHT_BUFFER_LOOP

    ; POWER 000..300 at offset 54.
    mov ax, POWER
    mov bx, 100
    xor dx, dx
    div bx
    add al, '0'
    mov FILE_BUFFER+54, al

    mov ax, POWER
    xor dx, dx
    mov bx, 100
    div bx
    mov ax, dx
    xor dx, dx
    mov bx, 10
    div bx
    add al, '0'
    mov FILE_BUFFER+55, al
    add dl, '0'
    mov FILE_BUFFER+56, dl

    ; MODE at offset 64.
    ; Day -> OFF, otherwise if any FULL -> FULL, else DIM.
    mov byte ptr FILE_BUFFER+64, 'O'
    mov byte ptr FILE_BUFFER+65, 'F'
    mov byte ptr FILE_BUFFER+66, 'F'

    cmp AMBIENT, 1
    je MODE_DONE

    lea si, LIGHTS
    mov cx, 5
    xor bx, bx
CHECK_FULL:
    cmp byte ptr [si], 2
    jne CHECK_NEXT
    mov bx, 1
    jmp MODE_SCAN_DONE
CHECK_NEXT:
    inc si
    loop CHECK_FULL
MODE_SCAN_DONE:
    cmp bx, 1
    jne SET_DIM_MODE
    mov byte ptr FILE_BUFFER+64, 'F'
    mov byte ptr FILE_BUFFER+65, 'U'
    mov byte ptr FILE_BUFFER+66, 'L'
    mov byte ptr FILE_BUFFER+67, 'L'
    jmp MODE_DONE
SET_DIM_MODE:
    mov byte ptr FILE_BUFFER+64, 'D'
    mov byte ptr FILE_BUFFER+65, 'I'
    mov byte ptr FILE_BUFFER+66, 'M'
MODE_DONE:

    ; Sequence number at offset 73, 0000..9999.
    inc SEQ
    mov ax, SEQ
    lea di, FILE_BUFFER+73
    mov bx, 1000
    xor dx, dx
    div bx
    add al, '0'
    mov [di], al

    mov ax, dx
    xor dx, dx
    mov bx, 100
    div bx
    add al, '0'
    mov [di+1], al

    mov ax, dx
    xor dx, dx
    mov bx, 10
    div bx
    add al, '0'
    mov [di+2], al
    add dl, '0'
    mov [di+3], dl

    pop di
    pop si
    pop dx
    pop cx
    pop bx
    pop ax
    ret
BUILD_FILE_BUFFER ENDP

; ------------------------- FILE I/O -------------------------
WRITE_STATE PROC
    push ax
    push bx
    push cx
    push dx

    ; Create/overwrite STATE.TXT.
    lea dx, FILE_NAME
    mov cx, 0
    mov ah, 3Ch
    int 21h
    jc WRITE_FAIL
    mov HANDLE, ax

    mov bx, ax
    lea dx, FILE_BUFFER
    mov cx, FILE_BUFFER_LEN
    mov ah, 40h
    int 21h

    mov bx, HANDLE
    mov ah, 3Eh
    int 21h

WRITE_FAIL:
    pop dx
    pop cx
    pop bx
    pop ax
    ret
WRITE_STATE ENDP

END_PROGRAM:
    mov ax, 4C00h
    int 21h
