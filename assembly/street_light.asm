; =========================================================
; 8086 Ambient + Vehicle-Aware Street Light Automation
; EMU8086 COM Program
;
; Ambient : 1=Day, 2=Dusk, 3=Night, 4=Exit
; Vehicle : 0=No, 1=Yes
; Position: 1..5
;
; Light state:
; 0=OFF, 1=DIM, 2=FULL
;
; Day              -> 00000
; Dusk             -> 11111
; Night + No Veh   -> 11111
; Night + Vehicle  -> vehicle +/- 1 = FULL
;
; Power: OFF=0W, DIM=20W, FULL=60W
; Output: STATE.TXT
; =========================================================

#make_com#
org 100h

jmp START

; ---------------- DATA ----------------

PAMB db 13,10,'Ambient: 1-Day  2-Dusk  3-Night  4-Exit',13,10
     db 'Choice: $'
PVEH db 13,10,'Vehicle? 0-No  1-Yes: $'
PPOS db 13,10,'Position (1-5): $'
OK   db 13,10,'STATE.TXT updated.',13,10,'$'
BAD  db 13,10,'Invalid input.',13,10,'$'

FNAME db 'STATE.TXT',0

BUF db 'AMBIENT=0',13,10
    db 'VEHICLE=0',13,10
    db 'POSITION=0',13,10
    db 'LIGHTS=00000',13,10
    db 'POWER=000',13,10
    db 'MODE=FULL',13,10
    db 'SEQ=0000',13,10
    db 'END',13,10

LIGHTS  db 0,0,0,0,0
AMBIENT db 0
VEHICLE db 0
POSITION db 0
POWER dw 0
SEQ dw 0
HANDLE dw 0
FLEN dw 85


; ---------------- MAIN ----------------

START:
    mov ax,cs
    mov ds,ax

MAIN:
    ; Ambient
    lea dx,PAMB
    mov ah,09h
    int 21h

    mov ah,01h
    int 21h
    sub al,'0'
    mov AMBIENT,al

    cmp al,1
    jb BAD_INPUT
    cmp al,4
    ja BAD_INPUT
    cmp al,4
    je EXIT

    ; Vehicle
    lea dx,PVEH
    mov ah,09h
    int 21h

    mov ah,01h
    int 21h
    sub al,'0'
    mov VEHICLE,al

    cmp al,0
    je NO_VEH
    cmp al,1
    jne BAD_INPUT

    ; Position
    lea dx,PPOS
    mov ah,09h
    int 21h

    mov ah,01h
    int 21h
    sub al,'0'
    mov POSITION,al

    cmp al,1
    jb BAD_INPUT
    cmp al,5
    ja BAD_INPUT
    jmp DECIDE

NO_VEH:
    mov POSITION,0


; ---------------- DECISION ----------------

DECIDE:

    ; First set all OFF
    lea si,LIGHTS
    mov cx,5
    xor al,al

CLEAR:
    mov [si],al
    inc si
    loop CLEAR

    ; Day -> OFF
    cmp AMBIENT,1
    je SAVE

    ; Dusk/Night -> DIM
    lea si,LIGHTS
    mov cx,5
    mov al,1

DIM_ALL:
    mov [si],al
    inc si
    loop DIM_ALL

    ; Only Night + Vehicle creates FULL zone
    cmp AMBIENT,3
    jne SAVE
    cmp VEHICLE,1
    jne SAVE

    ; Current lamp
    mov al,POSITION
    xor ah,ah
    dec ax
    lea si,LIGHTS
    add si,ax
    mov byte ptr [si],2

    ; Left neighbour
    mov al,POSITION
    cmp al,1
    je RIGHT
    xor ah,ah
    sub ax,2
    lea si,LIGHTS
    add si,ax
    mov byte ptr [si],2

RIGHT:
    ; Right neighbour
    mov al,POSITION
    cmp al,5
    je SAVE
    xor ah,ah
    lea si,LIGHTS
    add si,ax
    mov byte ptr [si],2


; ---------------- POWER ----------------

SAVE:
    call CALC_POWER
    call BUILD_BUFFER
    call WRITE_FILE

    lea dx,OK
    mov ah,09h
    int 21h

    jmp MAIN


CALC_POWER PROC
    xor ax,ax
    lea si,LIGHTS
    mov cx,5

PLOOP:
    mov bl,[si]

    cmp bl,1
    je PDIM
    cmp bl,2
    je PFULL
    jmp PNEXT

PDIM:
    add ax,20
    jmp PNEXT

PFULL:
    add ax,60

PNEXT:
    inc si
    loop PLOOP

    mov POWER,ax
    ret
CALC_POWER ENDP


; ---------------- BUILD FILE ----------------

BUILD_BUFFER PROC

    ; Ambient
    mov al,AMBIENT
    add al,'0'
    mov BUF+8,al

    ; Vehicle
    mov al,VEHICLE
    add al,'0'
    mov BUF+19,al

    ; Position
    mov al,POSITION
    add al,'0'
    mov BUF+31,al

    ; Lights
    lea si,LIGHTS
    lea di,BUF+41
    mov cx,5

LB:
    mov al,[si]
    add al,'0'
    mov [di],al
    inc si
    inc di
    loop LB

    ; Power = 3 digits
    mov ax,POWER
    lea di,BUF+54
    call PUT3

    ; Default mode = DIM
    mov byte ptr BUF+64,'D'
    mov byte ptr BUF+65,'I'
    mov byte ptr BUF+66,'M'

    ; Day = OFF
    cmp AMBIENT,1
    je OFF_MODE

    ; Check for FULL
    lea si,LIGHTS
    mov cx,5

CHECK:
    cmp byte ptr [si],2
    je FULL_MODE
    inc si
    loop CHECK

    ; DIM mode
    mov byte ptr BUF+67,13
    mov byte ptr BUF+68,10
    mov byte ptr BUF+69,'S'
    mov byte ptr BUF+70,'E'
    mov byte ptr BUF+71,'Q'
    mov byte ptr BUF+72,'='
    lea di,BUF+73
    mov FLEN,84
    jmp SEQUENCE

OFF_MODE:
    mov byte ptr BUF+64,'O'
    mov byte ptr BUF+65,'F'
    mov byte ptr BUF+66,'F'
    mov byte ptr BUF+67,13
    mov byte ptr BUF+68,10
    mov byte ptr BUF+69,'S'
    mov byte ptr BUF+70,'E'
    mov byte ptr BUF+71,'Q'
    mov byte ptr BUF+72,'='
    lea di,BUF+73
    mov FLEN,84
    jmp SEQUENCE

FULL_MODE:
    mov byte ptr BUF+64,'F'
    mov byte ptr BUF+65,'U'
    mov byte ptr BUF+66,'L'
    mov byte ptr BUF+67,'L'
    mov byte ptr BUF+68,13
    mov byte ptr BUF+69,10
    mov byte ptr BUF+70,'S'
    mov byte ptr BUF+71,'E'
    mov byte ptr BUF+72,'Q'
    mov byte ptr BUF+73,'='
    lea di,BUF+74
    mov FLEN,85


SEQUENCE:
    inc SEQ
    cmp SEQ,10000
    jb SEQ_OK
    mov SEQ,0

SEQ_OK:
    mov ax,SEQ
    call PUT4

    ; Add END section
    cmp FLEN,85
    je FULL_END

    mov byte ptr BUF+77,13
    mov byte ptr BUF+78,10
    mov byte ptr BUF+79,'E'
    mov byte ptr BUF+80,'N'
    mov byte ptr BUF+81,'D'
    mov byte ptr BUF+82,13
    mov byte ptr BUF+83,10
    ret

FULL_END:
    mov byte ptr BUF+78,13
    mov byte ptr BUF+79,10
    mov byte ptr BUF+80,'E'
    mov byte ptr BUF+81,'N'
    mov byte ptr BUF+82,'D'
    mov byte ptr BUF+83,13
    mov byte ptr BUF+84,10
    ret

BUILD_BUFFER ENDP


; ---------------- NUMBER CONVERSION ----------------

; AX = 000..999
; DI = destination
PUT3 PROC
    mov bx,100
    xor dx,dx
    div bx
    add al,'0'
    mov [di],al

    mov ax,dx
    xor dx,dx
    mov bx,10
    div bx
    add al,'0'
    mov [di+1],al
    add dl,'0'
    mov [di+2],dl
    ret
PUT3 ENDP


; AX = 0000..9999
; DI = destination
PUT4 PROC
    mov bx,1000
    xor dx,dx
    div bx
    add al,'0'
    mov [di],al

    mov ax,dx
    xor dx,dx
    mov bx,100
    div bx
    add al,'0'
    mov [di+1],al

    mov ax,dx
    xor dx,dx
    mov bx,10
    div bx
    add al,'0'
    mov [di+2],al
    add dl,'0'
    mov [di+3],dl
    ret
PUT4 ENDP


; ---------------- FILE I/O ----------------

WRITE_FILE PROC
    lea dx,FNAME
    xor cx,cx
    mov ah,3Ch
    int 21h
    jc WF_END

    mov HANDLE,ax
    mov bx,ax
    lea dx,BUF
    mov cx,FLEN
    mov ah,40h
    int 21h

    mov bx,HANDLE
    mov ah,3Eh
    int 21h

WF_END:
    ret
WRITE_FILE ENDP


BAD_INPUT:
    lea dx,BAD
    mov ah,09h
    int 21h
    jmp MAIN

EXIT:
    mov ax,4C00h
    int 21h