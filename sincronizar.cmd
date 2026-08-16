@echo off
:: Sincronizar y publicar ahora son lo mismo: un solo comando que baja los
:: cambios del telefono y sube los tuyos, todo junto. Este atajo llama al de
:: siempre para que cualquiera de los dos iconos haga todo.
call "%~dp0publicar-web.cmd"
