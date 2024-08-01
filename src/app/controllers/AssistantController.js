class AssistantControler {

    root(req, res) {
        const apiStatus = {
          status: 'online',
          version: 'Convert Ai 1.0.1'
        };
      
        res.status(200).json(apiStatus);
      }

    register () {}
    index(){}
    show(){}
    store(){}
    update(){}
    delete(){}

}

export default new AssistantControler ()